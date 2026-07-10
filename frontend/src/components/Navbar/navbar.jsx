import {useCallback, useEffect, useState} from "react";
import Spinner from "../spinner";
import LogoAndCreate from "./logoAndCreate";
import ColorCategoryAndSignOut from "./colorCategoryAndSignOut";
import Switch from "./switch";
import CategoryAndColorGroup from "../Link/categoryAndColorGroup";

export default function Navbar(props) {
    const [isLoading, setIsLoading] = useState(true);

    const handleColorClick = useCallback(() => {
        props.setIsColorClicked(!props.isColorClicked);
        props.setIsCategoryClicked(false);
    }, [props]);

    const handleCategoryClick = useCallback(() => {
        props.setIsCategoryClicked(!props.isCategoryClicked);
        props.setIsColorClicked(false);
    }, [props]);

    useEffect(() => {
        if (props) setTimeout(() => setIsLoading(false), 150);
    }, [props]);

    return (
        isLoading ? <Spinner/> :
            <nav className="navbar navbar-black bg-transparent pb-0">
                <div className="container-fluid ms-2 me-1">
                    <LogoAndCreate handleLinkClicked={props.handleLinkClicked} isVisible={props.isVisible}
                                   color={props.color} isCreateVisible={props.isVisible}/>
                    <div className="d-grid">
                        <div className="input-group align-items-center">
                            {props.isVisible &&
                                <ColorCategoryAndSignOut handleLinkClicked={props.handleLinkClicked}
                                                         removeCookie={props.removeCookie}
                                                         handleColorClick={handleColorClick}
                                                         isColorClicked={props.isColorClicked} color={props.color}
                                                         handleCategoryClick={handleCategoryClick}
                                                         isCategoryClicked={props.isCategoryClicked}/>}
                            <Switch isChecked={props.isChecked} onChange={props.handleCheckedChange}
                                    color={props.colorHex}/>
                        </div>
                    </div>
                </div>
                {props.isVisible &&
                    <CategoryAndColorGroup isCategoryClicked={props.isCategoryClicked}
                                           categories={props.categories} color={props.color} cookies={props.cookies}
                                           handleCategoryClick={handleCategoryClick}
                                           isColorClicked={props.isColorClicked}
                                           handleColorClick={handleColorClick}/>}
            </nav>
    );
}
