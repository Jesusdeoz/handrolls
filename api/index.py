import os
import psycopg2
import psycopg2.extras
from flask import Flask, render_template, request, redirect, jsonify, g, abort, Response
from urllib.parse import urlparse
from pathlib import Path
import traceback

# -------------------- APP --------------------
app = Flask(__name__, static_folder='static', template_folder='templates')

# -------------------- DB CONFIG --------------------
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL no está definida. En Vercel usa la URI de Connection Pooling (pgBouncer, puerto 6543) con sslmode=require."
    )
# fuerza ssl si faltara
if DATABASE_URL.startswith("postgres") and "sslmode=" not in DATABASE_URL:
    DATABASE_URL += ("&" if "?" in DATABASE_URL else "?") + "sslmode=require"

def get_db():
    if 'db' not in g:
        g.db = psycopg2.connect(DATABASE_URL)
    return g.db

def fetch_all(sql, params=None):
    conn = get_db()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params or ())
        return cur.fetchall()

def fetch_one(sql, params=None):
    conn = get_db()
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params or ())
        return cur.fetchone()

def exec_sql(sql, params=None):
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute(sql, params or ())
    conn.commit()

@app.teardown_appcontext
def close_db(_exc):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def _to_int(x):
    try:
        v = int(x)
        return max(v, 0)
    except Exception:
        return 0

def build_soya_string(soya_normal_qty, soya_dulce_qty):
    n = _to_int(soya_normal_qty)
    d = _to_int(soya_dulce_qty)
    # devuelve None si no hay nada (para dejar la columna vacía)
    return None if (n == 0 and d == 0) else f"normal:{n};dulce:{d}"

def parse_soya_string(s):
    n = d = 0
    if s:
        for part in s.split(";"):
            if ":" in part:
                k, v = part.split(":", 1)
                if k.strip() == "normal":
                    n = _to_int(v)
                elif k.strip() == "dulce":
                    d = _to_int(v)
    return n, d


# -------------------- DEBUG / DIAG --------------------
@app.errorhandler(Exception)
def _handle_any_error(e):
    # En Vercel puedes definir APP_DEBUG=1 (en Preview) para ver el stack
    if os.getenv("APP_DEBUG") == "1":
        tb = traceback.format_exc()
        print(tb)
        return Response(f"ERROR: {e}\n\n{tb}", status=500, mimetype="text/plain; charset=utf-8")
    return Response("Internal Server Error", status=500)

@app.route("/_routes")
def _routes():
    return "<pre>" + "\n".join(sorted(str(r) for r in app.url_map.iter_rules())) + "</pre>"

@app.route("/_diag")
def _diag():
    info = {}
    # rutas/plantillas/estáticos
    here = Path(__file__).resolve().parent
    tpl_dir = Path(app.template_folder or "templates")
    static_dir = Path(app.static_folder or "static")
    info["template_folder"] = str(tpl_dir)
    info["static_folder"] = str(static_dir)
    info["templates_list"] = sorted([p.name for p in (here / tpl_dir).glob("*")]) if (here / tpl_dir).exists() else []
    info["static_list"] = sorted([p.name for p in (here / static_dir).glob("*")]) if (here / static_dir).exists() else []
    # DB redacted
    u = urlparse(DATABASE_URL)
    info["database_url_redacted"] = f"{u.scheme}://{u.username or ''}:***@{u.hostname}:{u.port}{u.path}{('?' + u.query) if u.query else ''}"
    # ping y tabla
    row = fetch_one("select 1 as ok")
    info["db_ok"] = bool(row and row["ok"] == 1)
    reg = fetch_one("select to_regclass('public.orders') as reg")
    info["orders_table_exists"] = bool(reg and reg["reg"])
    if info["orders_table_exists"]:
        cnt = fetch_one("select count(*) as n from public.orders")
        info["orders_count"] = cnt["n"]
    info["edit_template_found"] = "edit.html" in info["templates_list"]
    return jsonify(info)

# -------------------- RUTAS HTML --------------------
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/kitchen")
def kitchen():
    return render_template("kitchen.html")

# -------------------- CREAR PEDIDO (form) --------------------
@app.route("/orders", methods=["POST"])
def create_order():
    cliente = request.form["cliente_nombre"].strip()
    telefono = request.form.get("telefono")
    detalle = request.form["detalle"].strip()
    soya_normal_qty = request.form.get("soya_normal_qty")
    soya_dulce_qty  = request.form.get("soya_dulce_qty")
    salsas = build_soya_string(soya_normal_qty, soya_dulce_qty)

    modalidad = request.form["modalidad"]
    medio_pago = request.form["medio_pago"]
    direccion = request.form.get("direccion") if modalidad == "despacho" else None
    comuna = request.form.get("comuna") if modalidad == "despacho" else None
    monto = int(request.form.get("monto_total_clp") or 0)
    observaciones = request.form.get("observaciones")

    exec_sql("""
        insert into public.orders
        (cliente_nombre, telefono, detalle, salsas, medio_pago, modalidad, direccion, comuna, monto_total_clp, estado, observaciones)
        values (%s,%s,%s,%s,%s,%s,%s,%s,%s,'nuevo',%s)
    """, (cliente, telefono, detalle, salsas, medio_pago, modalidad, direccion, comuna, monto, observaciones))

    return redirect("/kitchen")

# -------------------- API: LISTAR / ACTUALIZAR ESTADO --------------------
@app.route("/api/orders")
def list_orders():
    # trae todos ordenados por hora de creación
    rows = fetch_all("select * from public.orders order by hora_creacion asc")
    return jsonify(rows)

NEXT = {
    "nuevo": "en_preparacion",
    "en_preparacion": "listo",
    # lo demás se marca explícito (despachado/entregado/retirado/cancelado)
}

@app.route("/api/orders/<int:oid>", methods=["PATCH"])
def update_order(oid):
    data = request.get_json(force=True)
    action = data.get("action")  # "next"|"cancel"|"despachado"|"entregado"|"retirado"
    row = fetch_one("select id, estado from public.orders where id = %s", (oid,))
    if not row:
        return jsonify({"error": "not found"}), 404

    estado = row["estado"]
    new_estado = estado
    if action == "next" and estado in NEXT:
        new_estado = NEXT[estado]
    elif action == "cancel":
        new_estado = "cancelado"
    elif action in ("despachado", "entregado", "retirado"):
        new_estado = action
    else:
        return jsonify({"error": "bad action"}), 400

    exec_sql("update public.orders set estado = %s where id = %s", (new_estado, oid))
    return jsonify({"ok": True, "estado": new_estado})

# -------------------- EDITAR PEDIDO (form) --------------------
@app.route("/orders/<int:oid>/edit")
def edit_order(oid):
    o = fetch_one("select * from public.orders where id = %s", (oid,))
    if not o:
        abort(404)
    n, d = parse_soya_string(o.get("salsas"))
    o2 = dict(o)
    o2["soya_normal_qty"] = n
    o2["soya_dulce_qty"]  = d
    return render_template("edit.html", o=o2)


# nombre y endpoint únicos para no chocar con update_order()
@app.route("/orders/<int:oid>/update", methods=["POST"], endpoint="orders_update_form")
def update_order_form(oid):
    cliente = request.form["cliente_nombre"].strip()
    telefono = request.form.get("telefono")
    detalle = request.form["detalle"].strip()
    soya_normal_qty = request.form.get("soya_normal_qty")
    soya_dulce_qty  = request.form.get("soya_dulce_qty")
    salsas = build_soya_string(soya_normal_qty, soya_dulce_qty)

    modalidad = request.form["modalidad"]
    medio_pago = request.form["medio_pago"]
    direccion = request.form.get("direccion") if modalidad == "despacho" else None
    comuna = request.form.get("comuna") if modalidad == "despacho" else None
    monto = int(request.form.get("monto_total_clp") or 0)
    observaciones = request.form.get("observaciones")

    exec_sql("""
      update public.orders
         set cliente_nombre=%s, telefono=%s, detalle=%s, salsas=%s,
             medio_pago=%s, modalidad=%s, direccion=%s, comuna=%s,
             monto_total_clp=%s, observaciones=%s
       where id=%s
    """, (cliente, telefono, detalle, salsas, medio_pago, modalidad,
          direccion, comuna, monto, observaciones, oid))

    return redirect("/")

