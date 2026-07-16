import {BrowserRouter as Router, Route, Routes as ReactRoutes} from "react-router-dom";
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
                    {/* A key nem dísz: a /create és a /update UGYANAZT a Save
                        komponenst rendereli, ezért a React alapból megtartaná a
                        példányt, és csak a propokat cserélné — a szerkesztett
                        to-do címe/kategóriája/taskjai bennragadnának az "új
                        to-do" űrlapon. Külön key = a React két külön dolognak
                        látja őket, és váltáskor tiszta lappal indul. */}
                    <Route path="/create" element={
                        <Save key="create" handleLinkClicked={props.handleLinkClicked}
                              categories={props.categories} handleCategoryChange={props.handleCategoryChange}/>}/>
                    <Route path="*" element={
                        <Read url="/" handleLinkClicked={props.handleLinkClicked}/>}/>
                    <Route path="/category" element={
                        <Read url="/category" handleLinkClicked={props.handleLinkClicked}/>}/>
                    <Route path="/color" element={
                        <Read url="/color" handleLinkClicked={props.handleLinkClicked}/>}/>
                    <Route path="/update" element={
                        <Save key="update" isUpdate={true} handleLinkClicked={props.handleLinkClicked}
                              categories={props.categories} handleCategoryChange={props.handleCategoryChange}/>}/>
                </ReactRoutes>
            </Router>
            :
            <Router>
                <Navbar isVisible={false}/>
                <ReactRoutes>
                    <Route path="/signup" element={<Entry isLogin={false}/>}/>
                    <Route path="*" element={<Entry isLogin={true}/>}/>
                </ReactRoutes>
            </Router>
    );
}
