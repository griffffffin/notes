import {Link, useLocation} from "react-router-dom";
import {useTheme} from "../../contexts/theme";

/* A kategóriák — a bővítés ide ír majd új sort (film, jegyzet). Az első egyben a
   fallback (ismeretlen úton). */
const CATEGORIES = [
    {path: "/to-do", label: "To-do"},
    {path: "/quotes", label: "Quotes"},
];

// Az aktuális kategória az URL ELSŐ szegmenséből (/to-do/category/... → /to-do).
// Exportált, mert a "+" gomb is ezt használja a create-célhoz.
export function currentCategory(pathname) {
    return CATEGORIES.find((category) => pathname.startsWith(category.path)) ?? CATEGORIES[0];
}

/* A logó felirata az AKTUÁLIS kategória, és a saját főoldalára visz. Kategóriák
   között egyelőre URL-ben váltunk (nincs legördülő). */
export default function CategorySwitcher(props) {
    const {color} = useTheme();
    const current = currentCategory(useLocation().pathname);

    return (
        <Link to={current.path} onClick={props.onClick} className="no-focus text-decoration-none">
            {/* A Quotes logó Dancing Scriptet visel (logo-quotes), a to-do a
                logó alap CaveatSemiBold-ját. */}
            <div className={"display-5 logo text-" + color +
                (current.path === "/quotes" ? " logo-quotes" : "")}>{current.label}</div>
        </Link>
    );
}
