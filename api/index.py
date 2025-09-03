from flask import abort, render_template, request, redirect

@app.route("/orders/<int:oid>/edit")
def edit_order(oid):
    o = fetch_one("select * from public.orders where id = %s", (oid,))
    if not o:
        abort(404)
    return render_template("edit.html", o=o)

@app.route("/orders/<int:oid>/update", methods=["POST"])
def update_order(oid):
    cliente = request.form["cliente_nombre"].strip()
    telefono = request.form.get("telefono")
    detalle = request.form["detalle"].strip()
    salsas = ",".join(request.form.getlist("salsas"))
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

# --- DEBUG & GUARD RUNTIME (pegar cerca de arriba de index.py) ---
import os, sys, json, traceback
from pathlib import Path
from urllib.parse import urlparse
from flask import Response, jsonify

# 1) Forzar que exista DATABASE_URL y que use SSL si falta
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL no está definida. En Vercel debe ser el Connection Pooling (pgBouncer, puerto 6543) con sslmode=require."
    )
if DATABASE_URL.startswith("postgres") and "sslmode=" not in DATABASE_URL:
    DATABASE_URL += ("&" if "?" in DATABASE_URL else "?") + "sslmode=require"

# 2) Error handler que muestra el stack cuando APP_DEBUG=1
@app.errorhandler(Exception)
def _handle_any_error(e):
    if os.getenv("APP_DEBUG") == "1":
        tb = traceback.format_exc()
        print(tb)
        return Response(f"ERROR: {e}\n\n{tb}", status=500, mimetype="text/plain; charset=utf-8")
    return Response("Internal Server Error", status=500)

# 3) Diagnóstico integral
@app.route("/_diag")
def _diag():
    info = {}
    try:
        # Paths y templates
        here = Path(__file__).resolve().parent
        tpl_dir = Path(app.template_folder or "templates")
        static_dir = Path(app.static_folder or "static")
        info["cwd"] = str(here)
        info["template_folder"] = str(tpl_dir)
        info["static_folder"] = str(static_dir)
        info["templates_list"] = sorted([p.name for p in (here / tpl_dir).glob("*")]) if (here / tpl_dir).exists() else []
        info["static_list"] = sorted([p.name for p in (here / static_dir).glob("*")]) if (here / static_dir).exists() else []

        # DB URL (redactada)
        u = urlparse(DATABASE_URL)
        info["database_url_redacted"] = f"{u.scheme}://{u.username or ''}:***@{u.hostname}:{u.port}{u.path}{('?' + u.query) if u.query else ''}"

        # Query simple
        row = fetch_one("select 1 as ok")
        info["db_ok"] = bool(row and row["ok"] == 1)

        # Existe tabla y conteo
        reg = fetch_one("select to_regclass('public.orders') as reg")
        info["orders_table_exists"] = bool(reg and reg["reg"])
        if info["orders_table_exists"]:
            cnt = fetch_one("select count(*) as n from public.orders")
            info["orders_count"] = cnt["n"]

        # Render de plantilla edit.html (solo verificación de existencia)
        if "edit.html" in info["templates_list"]:
            info["edit_template_found"] = True
        else:
            info["edit_template_found"] = False

        return jsonify(info)
    except Exception as e:
        tb = traceback.format_exc()
        print("DIAG ERROR:", tb)
        return jsonify({"ok": False, "error": str(e), "trace": tb}), 500


