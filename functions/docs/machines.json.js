import doc from "../../docs/machines.json";
import { responder } from "../_censo-publico.js";
export const onRequestGet = ({ request, env }) => responder(doc, request, env);
