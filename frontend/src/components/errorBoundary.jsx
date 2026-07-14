import {Component} from "react";

/* Hibahatár: elkapja a fa alatt keletkező futásidejű hibákat, és a néma
   (üres képernyős) összeomlás helyett kiírja őket.

   Osztálykomponens, mert a React ezt a képességet (componentDidCatch) máig
   csak osztályon kínálja — hookos megfelelője nincs.

   A stílusok SZÁNDÉKOSAN inline-ok, nem a téma osztályai: a hibaképernyő akkor
   is működjön, ha épp a ThemeProvider (vagy a CSS) az, ami elromlott. Egy
   hibakezelőnek nem lehetnek függőségei.

   Fejlesztésben megmutatja a hibaüzenetet és a komponens-hívási láncot;
   élesben csak barátságos üzenetet — a részletek a konzolba mennek. */

const styles = {
    doboz: {
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "1rem",
        padding: "2rem", textAlign: "center",
        background: "#111", color: "#eee",
        fontFamily: "system-ui, sans-serif",
    },
    gomb: {
        padding: "0.5rem 1.5rem", borderRadius: "999px", cursor: "pointer",
        border: "1px solid #ffc107", background: "#ffc107", color: "#000",
        fontSize: "1rem",
    },
    reszletek: {
        maxWidth: "90vw", overflow: "auto", textAlign: "left",
        background: "#1c1c1c", color: "#ff8080", padding: "1rem",
        borderRadius: "8px", fontSize: "0.8rem", marginTop: "1rem",
    },
};

export default class ErrorBoundary extends Component {
    state = {error: null, info: null};

    static getDerivedStateFromError(error) {
        return {error};
    }

    componentDidCatch(error, info) {
        this.setState({info});
        console.error("Elkapott hiba:", error, info.componentStack);
    }

    render() {
        const {error, info} = this.state;
        if (!error) return this.props.children;

        return (
            <div style={styles.doboz}>
                <h1>Hiba történt</h1>
                <p>Az alkalmazás váratlan hibába ütközött. Próbáld újratölteni az oldalt.</p>
                <button type="button" style={styles.gomb} onClick={() => window.location.reload()}>
                    Újratöltés
                </button>

                {import.meta.env.DEV &&
                    <pre style={styles.reszletek}>
                        {error.toString()}
                        {info?.componentStack}
                    </pre>}
            </div>
        );
    }
}
