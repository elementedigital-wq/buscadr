import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/_shell.tsx", [
    index("routes/home.tsx"),
    route("explorar", "routes/explorar.tsx"),
    route("categorias", "routes/categorias.tsx"),
    route("equipo/:slug", "routes/equipo.tsx"),
    route("equipo/:slug/reservar", "routes/reservar.tsx"),
    route("alquiler/:ciudad/:categoria", "routes/landing.tsx"),
    route("reservas", "routes/reservas.tsx"),
    route("reservas/:id", "routes/reserva.tsx"),
    route("publicar", "routes/publicar.tsx"),
    route("panel", "routes/panel.tsx"),
    route("favoritos", "routes/favoritos.tsx"),
    route("cuenta", "routes/cuenta.tsx"),
    route("admin", "routes/admin.tsx"),
    route("como-funciona", "routes/como-funciona.tsx"),
    route("*", "routes/not-found.tsx"),
  ]),
  route("maestro", "routes/maestro.tsx"),
  route("maestro/restablecer", "routes/maestro-restablecer.tsx"),
  route("sitemap.xml", "routes/sitemap.ts"),
] satisfies RouteConfig;
