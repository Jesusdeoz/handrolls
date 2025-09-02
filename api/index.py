import os
from flask import Flask, render_template, request, redirect, jsonify, g
import psycopg2
import psycopg2.extras

# En Vercel define la variable DATABASE_URL en Project Settings (Environment Variables).
# Usa SIEMPRE el string de "Connection Pooling" (pgBouncer, puerto 6543) con sslmode=require.
DATABASE_URL = os.getenv("DATABASE_URL")

app = Flask(__name__, static_folder='static', template_folder='templates')

# ---------- DB helpers ----------
def get_db():
    if 'db' not in g:
        # conexión por request (serverless). Vercel crea procesos efímeros.
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

# ---------- Rutas ----------
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/kitchen")
def kitchen():
    return render_template("kitchen.html")

@app.route("/orders", methods=["POST"])
def create_order():
    cliente = request.form["cliente_nombre"].strip()
    detalle = request.form["detalle"].strip()
    salsas = ",".join(request.form.getlist("salsas"))
    modalidad = request.form["modalidad"]
    medio_pago = request.form["medio_pago"]
    direccion = request.form.get("direccion") if modalidad == "despacho" else None
    comuna = request.form.get("comuna") if modalidad == "despacho" else None
    monto = int(request.form.get("monto_total_clp") or 0)
    observaciones = request.form.get("observaciones")

    exec_sql(
        """
        insert into public.orders
        (cliente_nombre, detalle, salsas, medio_pago, modalidad, direccion, comuna, monto_total_clp, estado, observaciones)
        values (%s,%s,%s,%s,%s,%s,%s,%s,'nuevo',%s)
        """,
        (cliente, detalle, salsas, medio_pago, modalidad, direccion, comuna, monto, observaciones)
    )
    return redirect("/kitchen")

@app.route("/api/orders")
def list_orders():
    estado = request.args.get("estado")
    if estado:
        rows = fetch_all(
            "select * from public.orders where estado = %s order by hora_creacion asc",
            (estado,)
        )
    else:
        rows = fetch_all("select * from public.orders order by hora_creacion asc")
    return jsonify(rows)

NEXT = {
    "nuevo": "en_preparacion",
    "en_preparacion": "listo",
    # el resto se marca explícito desde mostrador
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

import traceback
from flask import jsonify

@app.route("/api/health")
def health():
    try:
        row = fetch_one("select 1 as ok")
        exists = fetch_one("select to_regclass('public.orders') as reg")
        return jsonify({
            "ok": row and row["ok"] == 1,
            "orders_table": bool(exists and exists["reg"]),
        })
    except Exception as e:
        print("HEALTH ERROR:", e)
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


