import { data } from "react-router";

export function loader() {
  throw data({ message: "La página que buscas no existe o cambió de dirección." }, { status: 404 });
}

export default function NotFound() {
  return null;
}
