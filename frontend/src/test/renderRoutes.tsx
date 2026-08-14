import {render} from "@testing-library/react";
import {CookiesProvider} from "react-cookie";
import {vi} from "vitest";
import Routes from "../components/routes";
import type {RoutesProps} from "../components/routes";
import {ThemeProvider} from "../contexts/theme";

/* A teljes route-fa renderelése egy adott útvonalon — a lista-, szerkesztő- és
   navbar-tesztek közös kerete.

   Miért a VALÓDI Routes és ThemeProvider, nem egy egyszerűsített mása? Mert a
   vizsgált viselkedések jó része épp az övék: melyik útvonal melyik nézetet adja,
   a /create ↔ /update váltás új példányt hoz-e (key), és milyen színt lát a
   komponens. Egy leegyszerűsített router pont azt nem tesztelné, amiben a hiba
   lakhat.

   Az App UI-propjai (kategóriák, nyíl-állapotok, handlerek) a tesztek 90%-át nem
   érdeklik, ezért itt kapnak semleges alapértéket; amelyik tesztnek számít (pl. a
   navbar kategória-legördülője), az a `props`-ban felülírja.

   A `path` pushState-tel áll be, mert a data router a böngésző előzményéből olvas.
   Elhagyva NEM nyúlunk az előzményhez — vannak tesztek, amelyek maguk állítják be
   az utat a renderelés előtt (néha többlépcsős előzményt építve a Vissza gombhoz),
   és azt egy alapértelmezett "/" csendben elrontaná.

   Amit ez a segéd SZÁNDÉKOSAN nem visz el: a szerverhívás mockolása (handleAxios)
   és a teszt adatai. Azok tesztfájlonként mások, és a teszt lényegéhez tartoznak —
   ha ide kerülnének, a tesztet olvasva nem lehetne látni, mire válaszol a "szerver".

   A `path` OPCIONÁLIS (l. fent: van, aki maga építi az előzményt), a felülíró
   propok `Partial<RoutesProps>`-ok — a Partial itt pontosan azt mondja ki, amit a
   segéd csinál: minden propnak van alapértéke, a teszt bármelyiket kicserélheti,
   de újat nem találhat ki. Egy elgépelt propnév innentől fordítási hiba. */
export function renderRoutes(path?: string, props: Partial<RoutesProps> = {}) {
    if (path !== undefined) window.history.pushState({}, "", path);
    return render(
        <CookiesProvider>
            <ThemeProvider>
                <Routes categories={[]} handleLinkClicked={vi.fn()} handleCategoryChange={vi.fn()}
                        setIsColorAngleClicked={vi.fn()} isColorAngleClicked={false}
                        setIsCategoryAngleClicked={vi.fn()} isCategoryAngleClicked={false}
                        {...props}/>
            </ThemeProvider>
        </CookiesProvider>
    );
}
