import {BrowserRouter as Router, Navigate, Route, Routes as ReactRoutes} from "react-router-dom";
import Navbar from "./Navbar/navbar";
import Entry from "./User/entry";
import Save from "./Todo/save";
import Read from "./Todo/read";
import QuoteRead from "./Quote/read";
import QuoteSave from "./Quote/save";
import QuotePublic from "./Quote/public";
import {useAuth} from "../contexts/auth";

/* Sem a téma, sem a bejelentkezés nem propként utazik: a komponensek a
   useTheme() és a useAuth() hookkal veszik ki őket, ahol szükségük van rájuk. */
export default function Routes(props) {
    const {isLoggedIn} = useAuth();

    return (isLoggedIn ?
            <Router>
                <Navbar
                    setIsColorClicked={props.setIsColorAngleClicked} isColorClicked={props.isColorAngleClicked}
                    setIsCategoryClicked={props.setIsCategoryAngleClicked}
                    isCategoryClicked={props.isCategoryAngleClicked}
                    handleLinkClicked={props.handleLinkClicked} isVisible={true}
                    categories={props.categories}/>
                <ReactRoutes>
                    {/* A gyökér az UTOLSÓ megnyitott kategóriára visz (a Read és a
                        QuoteRead mountkor a localStorage-ba menti, melyikben jársz),
                        így ott folytatod, ahol abbahagytad. Első alkalommal (üres
                        tár) a /to-do. Eszközönként külön, mert localStorage. */}
                    <Route path="/" element={
                        <Navigate to={localStorage.getItem("lastCategory") ?? "/to-do"} replace/>}/>
                    <Route path="/to-do" element={
                        <Read url="/to-do" handleLinkClicked={props.handleLinkClicked}/>}/>
                    {/* A key nem dísz: a /to-do/create és a /to-do/update UGYANAZT
                        a Save komponenst rendereli, ezért a React alapból
                        megtartaná a példányt, és csak a propokat cserélné — a
                        szerkesztett to-do címe/kategóriája/taskjai bennragadnának
                        az "új to-do" űrlapon. Külön key = a React két külön
                        dolognak látja őket, és váltáskor tiszta lappal indul. */}
                    <Route path="/to-do/create" element={
                        <Save key="create" handleLinkClicked={props.handleLinkClicked}
                              categories={props.categories} handleCategoryChange={props.handleCategoryChange}/>}/>
                    {/* A szűrő és a szerkesztendő azonosító az URL-ben, nem a
                        navigációs state-ben — így F5/direkt link sem törik el
                        (a state csak navigációval együtt érkezik). A :name a
                        kategória/szín, a :id a szerkesztett to-do azonosítója. */}
                    <Route path="/to-do/category/:name" element={
                        <Read url="/to-do/category" handleLinkClicked={props.handleLinkClicked}/>}/>
                    <Route path="/to-do/color/:name" element={
                        <Read url="/to-do/color" handleLinkClicked={props.handleLinkClicked}/>}/>
                    <Route path="/to-do/update/:id" element={
                        <Save key="update" isUpdate={true} handleLinkClicked={props.handleLinkClicked}
                              categories={props.categories} handleCategoryChange={props.handleCategoryChange}/>}/>
                    {/* Idézetek. A lista és a szerző-szűrt nézet ugyanaz a
                        QuoteRead (a url-prop dönti, szűr-e); a create és az update
                        ugyanaz a QuoteSave, külön key-vel (mint a to-dónál). A
                        statikus /quotes/create és /quotes/update rangban megelőzi
                        a dinamikus /quotes/:author-t, így nem ütköznek. */}
                    <Route path="/quotes" element={
                        <QuoteRead url="/quotes" handleLinkClicked={props.handleLinkClicked}/>}/>
                    <Route path="/quotes/create" element={
                        <QuoteSave key="quote-create" handleLinkClicked={props.handleLinkClicked}/>}/>
                    <Route path="/quotes/update/:id" element={
                        <QuoteSave key="quote-update" isUpdate={true} handleLinkClicked={props.handleLinkClicked}/>}/>
                    <Route path="/quotes/:author" element={
                        <QuoteRead url="/quotes/author" handleLinkClicked={props.handleLinkClicked}/>}/>
                    {/* Egy megosztott idézet publikus nézete. A bejelentkezett is
                        megnyithatja (olvasásra); a kijelentkezett ágban ugyanez a
                        route szerepel, hogy token nélkül is elérhető legyen. */}
                    <Route path="/quotes/:author/:id" element={<QuotePublic/>}/>
                    {/* Ismeretlen út → a to-do listára (a régi "* → főlista"
                        mintát megtartva, csak explicit átirányítással). */}
                    <Route path="*" element={<Navigate to="/to-do" replace/>}/>
                </ReactRoutes>
            </Router>
            :
            <Router>
                <Navbar isVisible={false}/>
                <ReactRoutes>
                    {/* Külön key, ugyanazért, mint a Save-nél: a két nézetet
                        ugyanaz az Entry rendereli, ezért a React megtartaná a
                        példányt, és a beírt adatok meg a hibaüzenet átjönnének
                        a másik űrlapra. */}
                    <Route path="/signup" element={<Entry key="signup" isLogin={false}/>}/>
                    {/* Publikus idézet-nézet bejelentkezés nélkül is — a megosztott
                        link ettől működik kijelentkezve. Minden más ismeretlen út a
                        bejelentkező képernyőre esik (a "*"). */}
                    <Route path="/quotes/:author/:id" element={<QuotePublic/>}/>
                    <Route path="*" element={<Entry key="login" isLogin={true}/>}/>
                </ReactRoutes>
            </Router>
    );
}
