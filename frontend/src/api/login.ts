const API = import.meta.env.PUBLIC_API_URL;

export async function api<T>(
    path: string,
    init: RequestInit = {},
): Promise<T> {

    const token = localStorage.getItem("token");

    const headers = new Headers(init.headers);

    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${API}${path}`, {
        ...init,
        headers,
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
}