import {BrowserRouter as Router, Route, Routes as ReactRoutes} from "react-router-dom";
import Navbar from "./Navbar/navbar";
import Entry from "./User/entry";
import Save from "./Todo/save";
import Read from "./Todo/read";

/* A téma (szín, háttér, kapcsoló) NEM propként utazik: a komponensek a
   useTheme() hookkal veszik ki a ThemeContextből, ahol szükségük van rá. */
export default function Routes(props) {
    return (props.isLoggedIn ?
            <Router>
                <Navbar
                    setIsColorClicked={props.setIsColorAngleClicked} isColorClicked={props.isColorAngleClicked}
                    setIsCategoryClicked={props.setIsCategoryAngleClicked}
                    isCategoryClicked={props.isCategoryAngleClicked}
                    handleLinkClicked={props.handleLinkClicked} isVisible={props.isLoggedIn}
                    removeCookie={props.removeCookie} cookies={props.cookies}
                    categories={props.categories}/>
                <ReactRoutes>
                    <Route path="/create" element={
                        <Save cookies={props.cookies} handleAxios={props.handleAxios}
                              handleLinkClicked={props.handleLinkClicked}
                              categories={props.categories} handleCategoryChange={props.handleCategoryChange}/>}/>
                    <Route path="*" element={
                        <Read cookies={props.cookies} url="/" handleAxios={props.handleAxios}
                              handleLinkClicked={props.handleLinkClicked}/>}/>
                    <Route path="/category" element={
                        <Read cookies={props.cookies} url="/category" handleAxios={props.handleAxios}
                              handleLinkClicked={props.handleLinkClicked}/>}/>
                    <Route path="/color" element={
                        <Read cookies={props.cookies} url="/color" handleAxios={props.handleAxios}
                              handleLinkClicked={props.handleLinkClicked}/>}/>
                    <Route path="/update" element={
                        <Save isUpdate={true} cookies={props.cookies} handleAxios={props.handleAxios}
                              handleLinkClicked={props.handleLinkClicked}
                              categories={props.categories} handleCategoryChange={props.handleCategoryChange}/>}/>
                </ReactRoutes>
            </Router>
            :
            <Router>
                <Navbar isVisible={props.isLoggedIn}/>
                <ReactRoutes>
                    <Route path="/signup"
                           element={<Entry isLogin={false} handleAxios={props.handleAxios}
                                           setCookie={props.setCookie}/>}/>
                    <Route path="*"
                           element={<Entry isLogin={true} handleAxios={props.handleAxios}
                                           setCookie={props.setCookie}/>}/>
                </ReactRoutes>
            </Router>
    );
}
