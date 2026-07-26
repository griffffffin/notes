import {createContext, useContext} from "react";

/* Az auth megosztható, NEM komponens része: a context és a useAuth hook — külön
   az AuthProvider komponenstől, hogy az auth.jsx csak komponenst exportáljon, és
   a Vite fast-refresh (HMR) megbízhatóan frissítsen (react/only-export-components). */
export const AuthContext = createContext(null);

export function useAuth() {
    const auth = useContext(AuthContext);
    if (!auth) throw new Error("useAuth csak <AuthProvider> alatt használható.");
    return auth;
}
