import {createContext, useContext, useMemo} from "react";
import {
    createBrowserRouter, createRoutesFromElements, Navigate, Outlet, Route, RouterProvider,
} from "react-router-dom";
import Navbar from "./Navbar/navbar";
import Entry from "./User/entry";
import Save from "./Todo/save";
import Read from "./Todo/read";
import QuoteRead from "./Quote/read";
import QuoteSave from "./Quote/save";
import QuotePublic from "./Quote/public";
import {useAuth} from "../contexts/auth";

/* Miért DATA ROUTER (createBrowserRouter + RouterProvider) a régi deklaratív
   <BrowserRouter> + <Routes> helyett? A szerkesztők (Save/QuoteSave) a
   `useBlocker` hookkal blokkolják a navigációt, amíg a create/update ellenőrzése
   + mentése le nem fut (Vissza gomb, logó, "+", szekció-váltás) — ez a hook csak
   data routerben él, sima <BrowserRouter> alatt invariant-hibát dob. A JSX
   route-fát a createRoutesFromElements megtartja, tehát a szerkezet ismerős
   marad; a Navbar egy layout-route-ba (közös <Outlet/>) kerül.

   Sem a téma, sem a bejelentkezés nem propként utazik: a komponensek a
   useTheme() és a useAuth() hookkal veszik ki őket, ahol szükségük van rájuk. */

/* Az App a UI-állapotát (kategóriák, "+"-nyilak, handlerek) EDDIG propként adta
   a Routes-nak. A data router route-definíciója viszont EGYSZER jön létre (memózva),
   így a benne rögzített elemek nem látnák az App friss propjait. Megoldás: az App
   propjait egy contexten át adjuk le; a lenti wrapper-komponensek onnan olvassák,
   és a VÁLTOZATLAN prop-interfészű oldal-komponenseknek (Navbar, Read, Save…) adják
   tovább. Így sem az App.jsx, sem az oldal-komponensek nem változnak a migrációtól. */
const RoutesPropsContext = createContext({});
const useRoutesProps = () => useContext(RoutesPropsContext);

/* A bejelentkezett elrendezés: a Navbar (teljes) + a route-tartalom (<Outlet/>).
   A Navbar a Routeren BELÜL renderelődik, ezért a useLocation() működik benne. */
function AppLayout() {
    const p = useRoutesProps();
    return (<>
        <Navbar setIsColorClicked={p.setIsColorAngleClicked} isColorClicked={p.isColorAngleClicked}
                setIsCategoryClicked={p.setIsCategoryAngleClicked}
                isCategoryClicked={p.isCategoryAngleClicked}
                handleLinkClicked={p.handleLinkClicked} isVisible={true}
                categories={p.categories}/>
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
function TodoReadRoute({url}) {
    const p = useRoutesProps();
    return <Read url={url} handleLinkClicked={p.handleLinkClicked}/>;
}

function TodoSaveRoute({isUpdate}) {
    const p = useRoutesProps();
    return <Save isUpdate={isUpdate} handleLinkClicked={p.handleLinkClicked}
                 categories={p.categories} handleCategoryChange={p.handleCategoryChange}/>;
}

function QuoteReadRoute({url}) {
    const p = useRoutesProps();
    return <QuoteRead url={url} handleLinkClicked={p.handleLinkClicked}/>;
}

function QuoteSaveRoute({isUpdate}) {
    const p = useRoutesProps();
    return <QuoteSave isUpdate={isUpdate} handleLinkClicked={p.handleLinkClicked}/>;
}

/* A két route-fa (bejelentkezve / kijelentkezve) — a régi Routes két <Router>-ágának
   1:1 megfelelője, csak data-router alakban. A `key` a Save/QuoteSave elemeken NEM
   dísz: a /create és a /update UGYANAZT a komponenst rendereli, a külön key nélkül a
   React megtartaná a példányt, és a szerkesztett elem mezői bennragadnának az "új"
   űrlapon. */
const loggedInRoutes = createRoutesFromElements(
    <Route element={<AppLayout/>}>
        {/* A gyökér az UTOLSÓ megnyitott SZEKCIÓRA visz (a Read és a QuoteRead
            mountkor a localStorage-ba menti, melyikben jársz). Első alkalommal
            (üres tár) a /to-do. Eszközönként külön, mert localStorage. */}
        <Route path="/" element={
            <Navigate to={localStorage.getItem("lastSection") ?? "/to-do"} replace/>}/>
        <Route path="/to-do" element={<TodoReadRoute url="/to-do"/>}/>
        <Route path="/to-do/create" element={<TodoSaveRoute key="create" isUpdate={false}/>}/>
        {/* A szűrő és a szerkesztendő azonosító az URL-ben, nem a navigációs
            state-ben — így F5/direkt link sem törik el. */}
        <Route path="/to-do/category/:name" element={<TodoReadRoute url="/to-do/category"/>}/>
        <Route path="/to-do/color/:name" element={<TodoReadRoute url="/to-do/color"/>}/>
        <Route path="/to-do/update/:id" element={<TodoSaveRoute key="update" isUpdate={true}/>}/>
        {/* Idézetek. A lista és a szerző-szűrt nézet ugyanaz a QuoteRead (a url-prop
            dönti, szűr-e); a create és az update ugyanaz a QuoteSave, külön key-vel.
            A statikus /quotes/create és /quotes/update rangban megelőzi a dinamikus
            /quotes/:author-t, így nem ütköznek. */}
        <Route path="/quotes" element={<QuoteReadRoute url="/quotes"/>}/>
        <Route path="/quotes/create" element={<QuoteSaveRoute key="quote-create" isUpdate={false}/>}/>
        <Route path="/quotes/update/:id" element={<QuoteSaveRoute key="quote-update" isUpdate={true}/>}/>
        <Route path="/quotes/:author" element={<QuoteReadRoute url="/quotes/author"/>}/>
        {/* Egy megosztott idézet publikus nézete. A bejelentkezett is megnyithatja
            (olvasásra); a kijelentkezett ágban ugyanez a route szerepel. */}
        <Route path="/quotes/:author/:id" element={<QuotePublic/>}/>
        {/* Ismeretlen út → a to-do listára (a régi "* → főlista" mintát megtartva). */}
        <Route path="*" element={<Navigate to="/to-do" replace/>}/>
    </Route>
);

const loggedOutRoutes = createRoutesFromElements(
    <Route element={<AuthLayout/>}>
        {/* Külön key, mint a Save-nél: a két nézetet ugyanaz az Entry rendereli,
            enélkül a beírt adatok meg a hibaüzenet átjönnének a másik űrlapra. */}
        <Route path="/signup" element={<Entry key="signup" isLogin={false}/>}/>
        {/* A szerkesztő-URL (/quotes/update/:id) kijelentkezve NEM publikus nézet:
            enélkül a statikus "update" szegmenst a lenti /quotes/:author/:id az
            author-nak venné, és megmutatná az idézetet. A szerkesztéshez belépés
            kell, ezért a bejelentkezőt adjuk; a statikus route megelőzi a dinamikusat. */}
        <Route path="/quotes/update/:id" element={<Entry key="login" isLogin={true}/>}/>
        {/* Publikus idézet-nézet bejelentkezés nélkül is — a megosztott link ettől
            működik kijelentkezve. Minden más ismeretlen út a bejelentkezőre esik. */}
        <Route path="/quotes/:author/:id" element={<QuotePublic/>}/>
        <Route path="*" element={<Entry key="login" isLogin={true}/>}/>
    </Route>
);

export default function Routes(props) {
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
