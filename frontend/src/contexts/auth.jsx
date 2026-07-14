import axios from "axios";
import {createContext, useCallback, useContext, useMemo} from "react";
import {useCookies} from "react-cookie";

/* Bejelentkezés és szerverhívás egy helyen.

   A "user" süti értéke a bejelentkezéskor kapott JWT. Minden kérés
   Authorization fejlécben viszi; a szerver EBBŐL tudja, ki vagy — a kérés
   törzsében küldött azonosítót figyelmen kívül hagyja (a régi app fő
   biztonsági gyengesége pont az volt, hogy hitt neki).

   401-nél (lejárt vagy érvénytelen token) a süti törlődik, így az app
   automatikusan visszavált a bejelentkező képernyőre. */

const AuthContext = createContext(null);

export function useAuth() {
    const auth = useContext(AuthContext);
    if (!auth) throw new Error("useAuth csak <AuthProvider> alatt használható.");
    return auth;
}

export function AuthProvider({children}) {
    const [cookies, setCookie, removeCookie] = useCookies(["user"]);
    const token = cookies.user ?? null;

    const login = useCallback((ujToken) => setCookie("user", ujToken, {path: "/"}), [setCookie]);
    const logout = useCallback(() => removeCookie("user", {path: "/"}), [removeCookie]);

    const handleAxios = useCallback((url, data, then, catchError) =>
        axios.post(import.meta.env.VITE_BACKEND + url, data,
            token ? {headers: {Authorization: "Bearer " + token}} : undefined)
            .then(then)
            .catch((error) => {
                if (error.response?.status === 401) removeCookie("user", {path: "/"});
                catchError(error);
            }), [token, removeCookie]);

    const value = useMemo(() => ({
        token,
        isLoggedIn: Boolean(token),
        login,
        logout,
        handleAxios,
    }), [token, login, logout, handleAxios]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
