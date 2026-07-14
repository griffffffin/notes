import {useCallback, useEffect, useState} from "react";
import {library} from "@fortawesome/fontawesome-svg-core";
import {fas} from "@fortawesome/free-solid-svg-icons";
import Routes from "./routes";
import {useAuth} from "../contexts/auth";

library.add(fas);

export default function App() {
    const [isColorAngleClicked, setIsColorAngleClicked] = useState(false);
    const [isCategoryAngleClicked, setIsCategoryAngleClicked] = useState(false);
    const [categories, setCategories] = useState([]);
    const {isLoggedIn, handleAxios} = useAuth();

    const handleLinkClicked = useCallback(() => {
        setIsColorAngleClicked(false);
        setIsCategoryAngleClicked(false);
    }, []);

    const handleCategoryChange = useCallback(() => {
        // Kijelentkezve nincs mit lekérni — enélkül a bejelentkező képernyőn is
        // elindulna egy kérés, ami 401-gyel bukna.
        if (!isLoggedIn) return;
        handleAxios("/categories", {}, (response) => setCategories(response.data),
            (error) => console.log(error.response?.data ?? error.message));
    }, [isLoggedIn, handleAxios]);

    useEffect(() => {
        handleCategoryChange();
    }, [handleCategoryChange]);

    /* Nincs betöltő-állapot: a bejelentkezés a sütiből azonnal tudható, a téma
       pedig a ThemeProviderből jön — nincs mire várni. */
    return (
        <div className="container-fluid px-0 bg-theme-page">
            <Routes handleLinkClicked={handleLinkClicked}
                    setIsColorAngleClicked={setIsColorAngleClicked} isColorAngleClicked={isColorAngleClicked}
                    setIsCategoryAngleClicked={setIsCategoryAngleClicked}
                    isCategoryAngleClicked={isCategoryAngleClicked}
                    categories={categories} handleCategoryChange={handleCategoryChange}/>
        </div>
    );
}
