import {BrowserRouter as Router, Navigate, Route, Routes as ReactRoutes} from "react-router-dom";
import Navbar from "./Navbar/navbar";
import Entry from "./User/entry";
import Save from "./Todo/save";
import Read from "./Todo/read";
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
                    {/* A gyökér az utolsó megnyitott kategóriára visz. Egyelőre
                        egyetlen kategória van (to-do), így ez fixen a /to-do; a
                        "legutóbb megnyitott kategória" (localStorage, eszközönként)
                        a második kategóriával (idézetek) jön, amikor van is mi
                        közt választani. */}
                    <Route path="/" element={<Navigate to="/to-do" replace/>}/>
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
                    <Route path="*" element={<Entry key="login" isLogin={true}/>}/>
                </ReactRoutes>
            </Router>
    );
}
