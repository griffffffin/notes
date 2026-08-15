import {Link, useLocation} from "react-router-dom";
import {useTheme} from "../../contexts/theme-context";
import {currentSection} from "./sections";
import {PATHS} from "../../paths";

/* A logó felirata az AKTUÁLIS szekció, és a saját főoldalára visz. Szekciók
   között egyelőre URL-ben váltunk (nincs legördülő). */
type SectionSwitcherProps = {
    /* Opcionális: kijelentkezve a logó csak dísz (nincs mit becsukni a kattintásra),
       ilyenkor a hívó nem ad kezelőt. */
    onClick?: () => void;
};

export default function SectionSwitcher(props: SectionSwitcherProps) {
    const {color} = useTheme();
    const current = currentSection(useLocation().pathname);

    return (
        <Link to={current.path} onClick={props.onClick} className="no-focus text-decoration-none">
            {/* A Quotes logó Dancing Scriptet visel (logo-quotes), a to-do a
                logó alap CaveatSemiBold-ját. */}
            <div className={"display-5 logo text-" + color +
                (current.path === PATHS.quotes ? " logo-quotes" : "")}>{current.label}</div>
        </Link>
    );
}
