import {Link, useLocation} from "react-router-dom";
import {useTheme} from "../../contexts/theme-context";
import {currentSection} from "./sections";

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
