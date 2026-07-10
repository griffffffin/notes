import {BrowserRouter as Router, Route, Routes as ReactRoutes} from "react-router-dom";
import Navbar from "./Navbar/navbar";
import Entry from "./User/entry";
import Save from "./Todo/save";
import Read from "./Todo/read";

export default function Routes(props) {
    return (props.isLoggedIn ?
            <Router>
                <Navbar
                    setIsColorClicked={props.setIsColorAngleClicked} isColorClicked={props.isColorAngleClicked}
                    setIsCategoryClicked={props.setIsCategoryAngleClicked}
                    isCategoryClicked={props.isCategoryAngleClicked}
                    handleLinkClicked={props.handleLinkClicked} isVisible={props.isLoggedIn}
                    color={props.color} colorHex={props.colorHex}
                    removeCookie={props.removeCookie} cookies={props.cookies}
                    isChecked={props.isChecked} handleCheckedChange={props.handleCheckedChange}
                    categories={props.categories}/>
                <ReactRoutes>
                    <Route path="/create" element={
                        <Save cookies={props.cookies} handleAxios={props.handleAxios}
                              handleLinkClicked={props.handleLinkClicked} backgroundColor={props.backgroundColor}
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
                              handleLinkClicked={props.handleLinkClicked} backgroundColor={props.backgroundColor}
                              categories={props.categories} handleCategoryChange={props.handleCategoryChange}/>}/>
                </ReactRoutes>
            </Router>
            :
            <Router>
                <Navbar isVisible={props.isLoggedIn} color={props.color} colorHex={props.colorHex}
                        isChecked={props.isChecked} handleCheckedChange={props.handleCheckedChange}/>
                <ReactRoutes>
                    <Route path="/signup"
                           element={<Entry isLogin={false} handleAxios={props.handleAxios} setCookie={props.setCookie}
                                           isChecked={props.isChecked}
                                           color={props.color} colorHex={props.colorHex}
                                           backgroundColor={props.backgroundColor}/>}/>
                    <Route path="*"
                           element={<Entry isLogin={true} handleAxios={props.handleAxios} setCookie={props.setCookie}
                                           isChecked={props.isChecked}
                                           color={props.color} backgroundColor={props.backgroundColor}/>}/>
                </ReactRoutes>
            </Router>
    );
}
