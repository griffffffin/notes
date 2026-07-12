import {useCallback, useEffect, useState} from "react";
import {useCookies} from "react-cookie";
import {library} from "@fortawesome/fontawesome-svg-core";
import {fas} from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import Spinner from "./spinner";
import Routes from "./routes";
import {useTheme} from "../contexts/theme";

library.add(fas);

export default function App() {
    const [isLoading, setIsLoading] = useState(true);
    const [cookies, setCookie, removeCookie] = useCookies(["user"]);
    const [isLoggedIn, setIsLoggedIn] = useState(null);
    const [isColorAngleClicked, setIsColorAngleClicked] = useState(false);
    const [isCategoryAngleClicked, setIsCategoryAngleClicked] = useState(false);
    const [categories, setCategories] = useState([]);
    const {backgroundColor} = useTheme();

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
        if (isLoggedIn !== null) setIsLoading(false);
    }, [isLoggedIn]);

    return (
        isLoading ? <Spinner class="min-vh-75"/> :
            <div className={"container-fluid px-0 bg-" + backgroundColor}>
                <Routes handleLinkClicked={handleLinkClicked}
                        setIsColorAngleClicked={setIsColorAngleClicked} isColorAngleClicked={isColorAngleClicked}
                        setIsCategoryAngleClicked={setIsCategoryAngleClicked}
                        isCategoryAngleClicked={isCategoryAngleClicked}
                        cookies={cookies} setCookie={setCookie} removeCookie={removeCookie}
                        isLoggedIn={isLoggedIn}
                        categories={categories} handleCategoryChange={handleCategoryChange}
                        handleAxios={handleAxios}/>
            </div>
    );
}
