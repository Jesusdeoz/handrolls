from flask import abort

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
       set cliente_nombre=%s,
           telefono=%s,
           detalle=%s,
           salsas=%s,
           medio_pago=%s,
           modalidad=%s,
           direccion=%s,
           comuna=%s,
           monto_total_clp=%s,
           observaciones=%s
     where id=%s
  """, (cliente, telefono, detalle, salsas, medio_pago, modalidad, direccion, comuna, monto, observaciones, oid))

  return redirect("/")
