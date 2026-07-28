import { api } from "./client";
import type Noticia from "../data/interfaces/Noticia";

export function getNoticias() {
    return api<Noticia[]>("/noticias");
}

export function getNoticia(id: number) {
    return api<Noticia>(`/noticias/${id}`);
}

export function getUltimasNoticias() {
    return api<Noticia[]>("/ultimas_noticias");
}