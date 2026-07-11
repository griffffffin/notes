import {useCallback, useEffect, useState} from "react";
import {useCookies} from "react-cookie";
import {library} from "@fortawesome/fontawesome-svg-core";
import {fas} from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import Spinner from "./spinner";
import Routes from "./routes";

library.add(fas);

export default function App() {
    const [isLoading, setIsLoading] = useState(true);
    const [isChecked, setIsChecked] = useState(false);
    const [cookies, setCookie, removeCookie] = useCookies(["user", "backgroundColor"]);
    const [backgroundColor, setBackgroundColor] = useState("");
    const [color, setColor] = useState("");
    const [colorHex, setColorHex] = useState("");
    const [isLoggedIn, setIsLoggedIn] = useState(null);
    const [isColorAngleClicked, setIsColorAngleClicked] = useState(false);
    const [isCategoryAngleClicked, setIsCategoryAngleClicked] = useState(false);
    const [categories, setCategories] = useState([]);

    const handleCheckedChange = useCallback(() => setIsChecked(!isChecked), [isChecked]);

    useEffect(() => {
        if (cookies.backgroundColor === "white") setIsChecked(true);
    }, [cookies.backgroundColor]);

    useEffect(() => {
        if (isChecked) {
            document.getElementsByTagName("html")[0].classList.remove("bg-black");
            setBackgroundColor("white");
            setColor("primary");
            setColorHex("#0d6efd");
            setCookie("backgroundColor", "white");
        } else {
            document.getElementsByTagName("html")[0].classList.add("bg-black");
            setBackgroundColor("black");
            setColor("warning");
            setColorHex("#ffc107");
            setCookie("backgroundColor", "black");
        }
    }, [isChecked, setCookie]);

    useEffect(() => {
        if (cookies.user) setIsLoggedIn(true);
        else {
            setIsLoggedIn(false);
            removeCookie("user");
        }
    }, [cookies.user, removeCookie]);

    const handleLinkClicked = useCallback(() => {
        setIsColorAngleClicked(false);
        setIsCategoryAngleClicked(false);
    }, []);

    /* A user-cookie értéke a bejelentkezéskor kapott JWT; minden kérés
       Authorization fejlécben viszi. 401-nél (lejárt/érvénytelen token)
       a cookie törlődik, így az app visszavált a login képernyőre. */
    const handleAxios = useCallback((url, data, then, catchError) =>
        axios.post(import.meta.env.VITE_BACKEND + url, data,
            cookies.user ? {headers: {Authorization: "Bearer " + cookies.user}} : undefined)
            .then(then)
            .catch((error) => {
                if (error.response?.status === 401) removeCookie("user");
                catchError(error);
            }), [cookies.user, removeCookie]);

    const handleCategoryChange = useCallback(() =>
        handleAxios("/categories", {user: cookies.user}, (response) => setCategories(response.data),
            (error) => console.log(error.response?.data ?? error.message)), [cookies.user, handleAxios]);

    useEffect(() => {
        handleCategoryChange();
    }, [handleCategoryChange]);

    useEffect(() => {
        if (backgroundColor && color && colorHex && isLoggedIn !== null)
            setIsLoading(false);
    }, [backgroundColor, color, colorHex, isLoggedIn]);

    return (
        isLoading ? <Spinner class="min-vh-75"/> :
            <div className={"container-fluid px-0 bg-" + backgroundColor}>
                <Routes handleLinkClicked={handleLinkClicked}
                        setIsColorAngleClicked={setIsColorAngleClicked} isColorAngleClicked={isColorAngleClicked}
                        setIsCategoryAngleClicked={setIsCategoryAngleClicked}
                        isCategoryAngleClicked={isCategoryAngleClicked}
                        cookies={cookies} setCookie={setCookie} removeCookie={removeCookie}
                        isLoggedIn={isLoggedIn}
                        color={color} colorHex={colorHex}
                        handleCheckedChange={handleCheckedChange} isChecked={isChecked}
                        categories={categories} handleCategoryChange={handleCategoryChange}
                        handleAxios={handleAxios}
                        backgroundColor={backgroundColor}/>
            </div>
    );
}
