import LogoAndCreate from "./logoAndCreate";
import ColorCategoryAndSignOut from "./colorCategoryAndSignOut";
import Switch from "./switch";
import CategoryAndColorGroup from "../Link/categoryAndColorGroup";

export default function Navbar(props) {
    /* Nincs useCallback: ezek sima onClick-ekre mennek, memózatlan komponensekre —
       a memózásnak nem lenne fogyasztója. (Ráadásul a régi [props] függőség
       hatástalan volt: a props objektum minden rendernél új.) */
    const handleColorClick = () => {
        props.setIsColorClicked(!props.isColorClicked);
        props.setIsCategoryClicked(false);
    };

    const handleCategoryClick = () => {
        props.setIsCategoryClicked(!props.isCategoryClicked);
        props.setIsColorClicked(false);
    };

    return (
        <nav className="navbar navbar-black bg-transparent pb-0">
            <div className="container-fluid ms-2 me-1">
                <LogoAndCreate handleLinkClicked={props.handleLinkClicked} isVisible={props.isVisible}
                               isCreateVisible={props.isVisible}/>
                <div className="d-grid">
                    <div className="input-group align-items-center">
                        {props.isVisible &&
                            <ColorCategoryAndSignOut handleLinkClicked={props.handleLinkClicked}
                                                     handleColorClick={handleColorClick}
                                                     isColorClicked={props.isColorClicked}
                                                     handleCategoryClick={handleCategoryClick}
                                                     isCategoryClicked={props.isCategoryClicked}/>}
                        <Switch/>
                    </div>
                </div>
            </div>
            {props.isVisible &&
                <CategoryAndColorGroup isCategoryClicked={props.isCategoryClicked}
                                       categories={props.categories}
                                       handleCategoryClick={handleCategoryClick}
                                       isColorClicked={props.isColorClicked}
                                       handleColorClick={handleColorClick}/>}
        </nav>
    );
}
