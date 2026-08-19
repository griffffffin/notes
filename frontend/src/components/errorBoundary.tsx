import {Component} from "react";
import type {ErrorInfo, ReactNode} from "react";
import {logDev} from "../log";

/* Hibahatár: elkapja a fa alatt keletkező futásidejű hibákat, és a néma
   (üres képernyős) összeomlás helyett kiírja őket.

   Osztálykomponens, mert a React ezt a képességet (componentDidCatch) máig
   csak osztályon kínálja — hookos megfelelője nincs.

   A stílusok SZÁNDÉKOSAN inline-ok, nem a téma osztályai: a hibaképernyő akkor
   is működjön, ha épp a ThemeProvider (vagy a CSS) az, ami elromlott. Egy
   hibakezelőnek nem lehetnek függőségei.

   Fejlesztésben megmutatja a hibaüzenetet és a komponens-hívási láncot;
   élesben csak barátságos üzenetet — a részletek a konzolba mennek. */

/* Az `as const` nem állítás egy értékről, hanem a literálok megőrzése: enélkül a
   `flexDirection: "column"` sima `string`-gé szürkülne, amit a React
   CSSProperties típusa (helyesen) nem fogad el. */
const styles = {
    screen: {
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "1rem",
        padding: "2rem", textAlign: "center",
        background: "#111", color: "#eee",
        fontFamily: "system-ui, sans-serif",
    },
    button: {
        padding: "0.5rem 1.5rem", borderRadius: "999px", cursor: "pointer",
        border: "1px solid #ffc107", background: "#ffc107", color: "#000",
        fontSize: "1rem",
    },
    details: {
        maxWidth: "90vw", overflow: "auto", textAlign: "left",
        background: "#1c1c1c", color: "#ff8080", padding: "1rem",
        borderRadius: "8px", fontSize: "0.8rem", marginTop: "1rem",
    },
} as const;

/* A hibahatár BÁRMIT elkaphat: JavaScriptben nem csak Error-t lehet dobni,
   ezért az `error` típusa `unknown`. A megjelenítés a `describeError`-ral megy —
   az minden értékre működik, míg egy `error.message` `undefined`-ot adna egy
   dobott stringre. */
type ErrorBoundaryProps = {
    children: ReactNode;
};

type ErrorBoundaryState = {
    error: unknown;
    info: ErrorInfo | null;
};

/* A HIBA OLVASHATÓ ALAKJA a fejlesztői részletekhez. A `String(error)` egy
   sima objektumra "[object Object]"-et ad — ami pont akkor mond semmit, amikor a
   legjobban kellene. Az `Error` a stack trace-t adja (abban benne van az üzenet
   is), minden másra JSON-t próbálunk, és ha az sem megy (körkörös hivatkozás),
   marad a szöveggé alakítás. */
function describeError(error: unknown): string {
    if (error instanceof Error) return error.stack ?? error.message;
    try {
        return JSON.stringify(error) ?? String(error);
    } catch {
        return String(error);
    }
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = {error: null, info: null};

    static getDerivedStateFromError(error: unknown): Pick<ErrorBoundaryState, "error"> {
        return {error};
    }

    componentDidCatch(error: unknown, info: ErrorInfo) {
        this.setState({info});
        logDev("Elkapott hiba:", error, info.componentStack);
    }

    render() {
        const {error, info} = this.state;
        if (!error) return this.props.children;

        return (
            <div style={styles.screen}>
                <h1>Hiba történt</h1>
                <p>Az alkalmazás váratlan hibába ütközött. Próbáld újratölteni az oldalt.</p>
                <button type="button" style={styles.button} onClick={() => window.location.reload()}>
                    Újratöltés
                </button>

                {import.meta.env.DEV &&
                    <pre style={styles.details}>
                        {describeError(error)}
                        {info?.componentStack}
                    </pre>}
            </div>
        );
    }
}
