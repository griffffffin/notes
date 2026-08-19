import type {MouseEventHandler} from "react";
import {Link} from "react-router-dom";
import {useTheme, type BootstrapColor} from "../../contexts/theme-context";

/* Egy SZŰRT NÉZETRE mutató hivatkozás — a szekciók közös váza. Ma a to-do
   kategóriája (/to-dos/category/:name) és az idézet szerzője (/quotes/:author)
   használja; a következő szekció (film: műfaj) ugyanezt kapja.

   Miért VALÓDI link, és nem kattintás-kezelős doboz? Mert a böngésző így ismeri
   fel célpontnak: látszik a cím az állapotsorban, működik a középső gombos "új
   lapon megnyitás" és a jobb gombos menü, a képernyőolvasó pedig linkként hirdeti
   ki. Ez egyben elhagyhatóvá teszi a kézzel adott role="button"-t, a tabIndexet
   és a billentyűkezelést: azt mind ingyen hozza a linkség.

   A CÍM ÉPÍTÉSE NEM ITT TÖRTÉNIK: a hívó egy BUILDER-FÜGGVÉNYT ad át (paths.ts),
   ez a komponens csak meghívja az értékkel. Eddig egy előtag-STRINGET kapott
   ("/quotes/"), amihez maga fűzte hozzá a kódolt értéket — két néma csapdával.
   Egyrészt a záró perjelet semmi nem őrizte: egy "/quotes" előtagból
   "/quotesKant" lett volna, ami a "*"-ágra esik, tehát némán átirányít. Másrészt
   a cím és a felirat KÉT külön propból jött, így egy figyelmetlen hívás olyan
   linket adhatott, ami mást ír ki, mint amire visz. Egy builderrel mindkettő
   ugyanabból az egy `value`-ból számítódik, és az útvonal alakja a paths.ts-ben
   van kimondva.

   A kódolást (szóköz, ékezet, perjel) így a builder végzi; a fogadó nézet a
   route-paramétert már dekódolva kapja (useParams), tehát ott nem kell — és nem
   is szabad — újra dekódolni.

   A színt a téma adja, KIVÉVE ha a hívó felülírja (color): a to-do kártyák
   lábléce a saját to-do színét viseli, nem a témáét.

   A d-block kell: az <a> alapból inline, a lábléc keretét és térközeit viszont
   csak blokként veszi fel rendesen.

   A kártya láblécén a húzással a rács kattintás-elnyelője békíti össze
   (useSortableCards): a felengedéskor érkező kattintást elnyeli, ha közben húzás
   történt, így a lista átrendezése nem navigál el. A navbarban ez nem fenyeget,
   mert ott nincs húzás. */
/* Exportált, mert a rá épülő szekció-linkek (LinkAuthor, LinkCategory) a saját
   propjaikat EBBŐL származtatják: ők csak a `to`-t és a `value`-t töltik ki, a
   többit változatlanul adják tovább. Így ha a váz egyszer új propot kap, nem kell
   három fájlban átvezetni — és nem is csúszhatnak el egymástól. */
export type FilterLinkProps = {
    /* A szűrt nézet ÚTVONAL-BUILDERE a paths.ts-ből (PATHS.todoCategory,
       PATHS.quotesByAuthor) — nem a kész cím és nem is egy előtag. A komponens
       ezt hívja meg a `value`-val; a kódolás és az útvonal alakja a builderé. */
    buildPath: (value: string) => string;
    /* A szűrés értéke — egyben a link látható szövege ÉS a címbe kerülő szegmens:
       a kategória, illetve a szerző neve. */
    value: string;
    onClick: MouseEventHandler<HTMLAnchorElement>;
    /* Ha elmarad, a téma színe érvényes (l. a fenti magyarázatot). */
    color?: BootstrapColor | undefined;
    class: string;
};

export default function FilterLink({buildPath, value, onClick, color, class: className}: FilterLinkProps) {
    const theme = useTheme();

    return (
        <Link to={buildPath(value)} onClick={onClick}
              className={className + " d-block text-decoration-none text-" + (color ?? theme.color)}>
            {value}
        </Link>
    );
}
