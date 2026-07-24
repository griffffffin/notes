import {Link, useLocation} from "react-router-dom";
import {useTheme} from "../../contexts/theme";

/* A szekciók: az alkalmazás felső szintű területei, mindegyik SAJÁT collectionnel
   (to-do, idézetek, később film, jegyzet). A bővítés ide ír majd új sort. Az első
   egyben a fallback (ismeretlen úton).

   FONTOS a szóhasználat: ez a "szekció" NEM azonos a to-do SAJÁT, szekción belüli
   "category" mezőjével (a színes chipek, /to-do/category/:name). Az egy elemek
   osztályozása egy szekción belül; ez itt maga a tartalomtípus. A két szint
   szándékosan külön nevet kap, hogy a kód ne mossa össze őket. */
const SECTIONS = [
    {path: "/to-do", label: "To-do"},
    {path: "/quotes", label: "Quotes"},
];

// Az aktuális szekció az URL ELSŐ szegmenséből (/to-do/category/... → /to-do).
// Exportált, mert a "+" gomb is ezt használja a create-célhoz.
export function currentSection(pathname) {
    return SECTIONS.find((section) => pathname.startsWith(section.path)) ?? SECTIONS[0];
}

/* A logó felirata az AKTUÁLIS szekció, és a saját főoldalára visz. Szekciók
   között egyelőre URL-ben váltunk (nincs legördülő). */
export default function SectionSwitcher(props) {
    const {color} = useTheme();
    const current = currentSection(useLocation().pathname);

    return (
        <Link to={current.path} onClick={props.onClick} className="no-focus text-decoration-none">
            {/* A Quotes logó Dancing Scriptet visel (logo-quotes), a to-do a
                logó alap CaveatSemiBold-ját. */}
            <div className={"display-5 logo text-" + color +
                (current.path === "/quotes" ? " logo-quotes" : "")}>{current.label}</div>
        </Link>
    );
}
