import {createContext, useContext, useMemo} from "react";
import {
    createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route, RouterProvider,
} from "react-router-dom";
import Navbar from "./Navbar/navbar";
import Entry from "./User/entry";
import Save from "./Todos/save";
import Read from "./Todos/read";
import QuoteRead from "./Quotes/read";
import QuoteSearchResults from "./Quotes/searchResults";
import QuoteSave from "./Quotes/save";
import QuotePublic from "./Quotes/public";
import {lastSectionPath} from "./Navbar/sections";
import {useAuth} from "../contexts/auth-context";
import {ENDPOINTS} from "../endpoints";
import type {Endpoint} from "../endpoints";
import {PATHS} from "../paths";
import type {CategoryAndColorGroupProps} from "./Link/categoryAndColorGroup";

/* Miért DATA ROUTER (createBrowserRouter + RouterProvider) a régi deklaratív
   <BrowserRouter> + <Routes> helyett? A szerkesztők (Save/QuoteSave) a
   `useBlocker` hookkal blokkolják a navigációt, amíg a create/update ellenőrzése
   + mentése le nem fut (Vissza gomb, logó, "+", szekció-váltás) — ez a hook csak
   data routerben él, sima <BrowserRouter> alatt invariant-hibát dob. A JSX
   route-fát a createRoutesFromElements megtartja, tehát a szerkezet ismerős
   marad; a Navbar egy layout-route-ba (közös <Outlet/>) kerül.

   Sem a téma, sem a bejelentkezés nem propként utazik: a komponensek a
   useTheme() és a useAuth() hookkal veszik ki őket, ahol szükségük van rájuk. */

/* Az App a UI-állapotát (kategóriák, "+"-nyilak, handlerek) az App-ból propként
   adja le. A `handleLinkClicked` és a `handleCategoryChange` valóban paraméter
   nélküli (l. app.tsx: a link-kattintás csak becsukja a nyitott vezérlőket, nem
   olvassa az eseményt) — a kártyák onClickjeként átadva a szűkebb `() => void` is
   megfelel a `MouseEventHandler`-t váró helyeknek. A két szög-állapot boolean +
   szűk setter (a repo settereinek konvenciója, l. Navbar). A `categories` a to-do
   kategórialista; a típusát a Navbar láncából vesszük át, hogy egyben mozogjon.

   EXPORTÁLT, mert a teszt-segéd (test/renderRoutes.tsx) ehhez méri a saját
   alapértékeit: ott a propok `Partial<RoutesProps>`-ként érkeznek, így ha ez a
   szerződés változik, a segéd is elhasal — nem a tesztek dőlnek el némán. */
export type RoutesProps = {
    handleLinkClicked: () => void;
    setIsColorAngleClicked: (isClicked: boolean) => void;
    isColorAngleClicked: boolean;
    setIsCategoryAngleClicked: (isClicked: boolean) => void;
    isCategoryAngleClicked: boolean;
    categories: CategoryAndColorGroupProps["categories"];
    categoriesFailed: CategoryAndColorGroupProps["categoriesFailed"];
    categoriesLoading: CategoryAndColorGroupProps["categoriesLoading"];
    handleCategoryChange: () => void;
};

/* Az App a UI-állapotát (kategóriák, "+"-nyilak, handlerek) EDDIG propként adta
   a Routes-nak. A data router route-definíciója viszont EGYSZER jön létre (memózva),
   így a benne rögzített elemek nem látnák az App friss propjait. Megoldás: az App
   propjait egy contexten át adjuk le; a lenti wrapper-komponensek onnan olvassák,
   és a VÁLTOZATLAN prop-interfészű oldal-komponenseknek (Navbar, Read, Save…) adják
   tovább. Így sem az app.tsx, sem az oldal-komponensek nem változnak a migrációtól.

   A context alapértéke `null` (nem egy üres objektum-hazugság): a Provider MINDIG
   körbeveszi a route-fát, ezért a `useRoutesProps` a null-ágon dob — a mai repo
   típusos contextjeinek mintája (l. auth-context.ts, theme-context.ts). */
const RoutesPropsContext = createContext<RoutesProps | null>(null);
function useRoutesProps() {
    const props = useContext(RoutesPropsContext);
    if (!props) throw new Error("useRoutesProps csak a RoutesPropsContext alatt használható.");
    return props;
}

/* A bejelentkezett elrendezés: a Navbar (teljes) + a route-tartalom (<Outlet/>).
   A Navbar a Routeren BELÜL renderelődik, ezért a useLocation() működik benne. */
function AppLayout() {
    const p = useRoutesProps();
    return (<>
        <Navbar setIsColorClicked={p.setIsColorAngleClicked} isColorClicked={p.isColorAngleClicked}
                setIsCategoryClicked={p.setIsCategoryAngleClicked}
                isCategoryClicked={p.isCategoryAngleClicked}
                handleLinkClicked={p.handleLinkClicked} isVisible={true}
                categories={p.categories} categoriesFailed={p.categoriesFailed}
                categoriesLoading={p.categoriesLoading}
                /* A navbar újratöltő ikonja UGYANAZT a lekérést indítja, amit a
                   mentés és a törlés is hív — nincs külön "retry" út. */
                onRetryCategories={p.handleCategoryChange}/>
        <Outlet/>
    </>);
}

/* A kijelentkezett elrendezés: a Navbar minimális (csak a téma-váltó), a többi
   vezérlőt az isVisible=false elrejti. */
function AuthLayout() {
    return (<>
        <Navbar isVisible={false}/>
        <Outlet/>
    </>);
}

/* Vékony wrapperek: a contextből olvassák az App friss propjait, és a meglévő
   oldal-komponenseknek adják tovább — azok interfésze nem változik. */
/* Az `url` itt a LEKÉRÉS végpontja (nem a böngésző címe): ugyanaz a lista-nézet
   szolgálja ki a szűretlen és a szűrt eseteket, csak más végpontról kér. Ezért
   `Endpoint` a típusa, nem `string`. */
function TodosReadRoute({url}: {url: Endpoint}) {
    const p = useRoutesProps();
    return <Read url={url} handleLinkClicked={p.handleLinkClicked}/>;
}

function TodosSaveRoute({isUpdate}: {isUpdate: boolean}) {
    const p = useRoutesProps();
    return <Save isUpdate={isUpdate} handleLinkClicked={p.handleLinkClicked}
                 categories={p.categories} handleCategoryChange={p.handleCategoryChange}/>;
}

function QuotesReadRoute({url}: {url: Endpoint}) {
    const p = useRoutesProps();
    return <QuoteRead url={url} handleLinkClicked={p.handleLinkClicked}/>;
}

function QuotesSearchRoute() {
    const p = useRoutesProps();
    return <QuoteSearchResults handleLinkClicked={p.handleLinkClicked}/>;
}

function QuotesSaveRoute({isUpdate}: {isUpdate: boolean}) {
    const p = useRoutesProps();
    return <QuoteSave isUpdate={isUpdate} handleLinkClicked={p.handleLinkClicked}/>;
}

/* Az utolsó megnyitott szekcióra visz — a gyökér ÉS az ismeretlen út közös célja.

   Miért KOMPONENS, és nem egyszerűen `<Navigate to={lastSectionPath()}/>` a route
   mellett? Mert a lenti route-fák MODUL SZINTŰ konstansok: a JSX propjai egyszer,
   a modul betöltésekor értékelődnek ki. Ott hívva a `lastSectionPath()` az első
   betöltéskori értéket fagyasztaná be, és a később megjegyzett szekció-váltás már
   nem látszana rajta — némán, mindig a régi helyre víve. Komponensként a hívás a
   RENDERELÉS idejére kerül, tehát mindig a friss emlékezetet olvassa.

   (Ma ezt a to-do → idézet váltás csak teljes újratöltéssel jár, ami a modult is
   újraértékeli — a hiba tehát lappangó. A `*`-ág átirányításával viszont élővé
   válna, és a tervezett szekció-váltó legördülővel is.) */
function RedirectToLastSection() {
    return <Navigate to={lastSectionPath()} replace/>;
}

/* A két route-fa (bejelentkezve / kijelentkezve) — a régi Routes két <Router>-ágának
   1:1 megfelelője, csak data-router alakban. A `key` a Save/QuoteSave elemeken NEM
   dísz: a /create és a /update UGYANAZT a komponenst rendereli, a külön key nélkül a
   React megtartaná a példányt, és a szerkesztett elem mezői bennragadnának az "új"
   űrlapon. */
const loggedInRoutes = createRoutesFromElements(
    <Route element={<AppLayout/>}>
        {/* A gyökér az UTOLSÓ megnyitott SZEKCIÓRA visz (a lista-nézetek mountkor
            jegyzik meg, melyikben jársz — useRememberSection). A tárolás
            részletei, a kulcs és az alapértelmezés a sections.ts-ben, egy helyen. */}
        <Route path={PATHS.root} element={<RedirectToLastSection/>}/>
        <Route path={PATHS.todos} element={<TodosReadRoute url={ENDPOINTS.todos}/>}/>
        <Route path={PATHS.todoCreate} element={<TodosSaveRoute key="create" isUpdate={false}/>}/>
        {/* A szűrő és a szerkesztendő azonosító az URL-ben, nem a navigációs
            state-ben — így F5/direkt link sem törik el. A MINTÁT (":name", ":id") a
            paths.ts ugyanabból az előtagból származtatja, amiből a rá mutató linkek
            címét építi — l. az ottani `route()` indoklását. */}
        <Route path={PATHS.todoCategory.pattern} element={<TodosReadRoute url={ENDPOINTS.todosByCategory}/>}/>
        <Route path={PATHS.todoColor.pattern} element={<TodosReadRoute url={ENDPOINTS.todosByColor}/>}/>
        <Route path={PATHS.todoUpdate.pattern} element={<TodosSaveRoute key="update" isUpdate={true}/>}/>
        {/* Idézetek. A lista és a szerző-szűrt nézet ugyanaz a QuoteRead (a url-prop
            dönti, szűr-e); a create és az update ugyanaz a QuoteSave, külön key-vel.
            A statikus /quotes/create és /quotes/update rangban megelőzi a dinamikus
            /quotes/:author-t, így nem ütköznek. */}
        <Route path={PATHS.quotes} element={<QuotesReadRoute url={ENDPOINTS.quotes}/>}/>
        <Route path={PATHS.quoteCreate} element={<QuotesSaveRoute key="quote-create" isUpdate={false}/>}/>
        <Route path={PATHS.quoteUpdate.pattern} element={<QuotesSaveRoute key="quote-update" isUpdate={true}/>}/>
        {/* A keresés szöveg-módú találata. A statikus "search" szegmens rangban
            megelőzi a dinamikus /quotes/:author-t ÉS a /quotes/:author/:id-t (a
            react-router a statikus szegmenst többre értékeli), ezért nem ütköznek. */}
        <Route path={PATHS.quoteSearch.pattern} element={<QuotesSearchRoute/>}/>
        <Route path={PATHS.quotesByAuthor.pattern} element={<QuotesReadRoute url={ENDPOINTS.quotesByAuthor}/>}/>
        {/* Egy megosztott idézet publikus nézete. A bejelentkezett is megnyithatja
            (olvasásra); a kijelentkezett ágban ugyanez a route szerepel. */}
        <Route path={PATHS.publicQuote.pattern} element={<QuotePublic/>}/>
        {/* Ismeretlen út → az UTOLSÓ megnyitott szekcióra, ugyanoda, ahova a gyökér.
            Eddig bedrótozottan a to-do listára vitt: aki az idézetek közt dolgozott
            és elrontott egy címet, az átesett a másik szekcióba. A "*" a react-router
            saját joker-mintája (nem a mi utunk), ezért marad szó szerint. */}
        <Route path="*" element={<RedirectToLastSection/>}/>
    </Route>
);

const loggedOutRoutes = createRoutesFromElements(
    <Route element={<AuthLayout/>}>
        {/* Külön key, mint a Save-nél: a két nézetet ugyanaz az Entry rendereli,
            enélkül a beírt adatok meg a hibaüzenet átjönnének a másik űrlapra. */}
        <Route path={PATHS.signup} element={<Entry key="signup" isLogin={false}/>}/>
        {/* A szerkesztő-URL (/quotes/update/:id) kijelentkezve NEM publikus nézet:
            enélkül a statikus "update" szegmenst a lenti /quotes/:author/:id az
            author-nak venné, és megmutatná az idézetet. A szerkesztéshez belépés
            kell, ezért a bejelentkezőt adjuk; a statikus route megelőzi a dinamikusat. */}
        <Route path={PATHS.quoteUpdate.pattern} element={<Entry key="login" isLogin={true}/>}/>
        {/* A keresés is bejelentkezést kíván: kijelentkezve a /quotes/search/:term a
            bejelentkezőre essen (mint az /update), NE a lenti /quotes/:author/:id
            publikus nézetre — az a "search"-öt szerzőnek, a kifejezést idézet-id-nek
            venné, és "Nem létező idézet"-et mutatna. A statikus "search" szegmens
            rangban megelőzi a dinamikus :author-t. */}
        <Route path={PATHS.quoteSearch.pattern} element={<Entry key="login" isLogin={true}/>}/>
        {/* Publikus idézet-nézet bejelentkezés nélkül is — a megosztott link ettől
            működik kijelentkezve. Minden más ismeretlen út a bejelentkezőre esik. */}
        <Route path={PATHS.publicQuote.pattern} element={<QuotePublic/>}/>
        <Route path="*" element={<Entry key="login" isLogin={true}/>}/>
    </Route>
);

export default function Routes(props: RoutesProps) {
    const {isLoggedIn} = useAuth();

    /* A routert az isLoggedIn értékére memózzuk: egy munkameneten belül (nincs
       be-/kijelentkezés) STABIL, így a useBlocker és a navigációs állapot megőrződik.
       Be-/kijelentkezéskor új router jön létre — ez szándékos kemény váltás. A
       RouterProvider a `router` prop cseréjét futásidőben NEM támogatja, ezért a
       váltást a `key`-vel kényszerített újramountolás intézi (l. lentebb). */
    const router = useMemo(
        () => createBrowserRouter(isLoggedIn ? loggedInRoutes : loggedOutRoutes),
        [isLoggedIn]);

    return (
        <RoutesPropsContext.Provider value={props}>
            <RouterProvider key={isLoggedIn ? "in" : "out"} router={router}/>
        </RoutesPropsContext.Provider>
    );
}
