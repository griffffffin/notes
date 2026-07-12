import LinkCategoryGroup from "./categoryGroup";
import LinkColorButtonGroup from "./colorButtonGroup";

export default function CategoryAndColorGroup(props) {
    return (
        <div className="row w-100">
            {props.isCategoryClicked &&
                <LinkCategoryGroup categories={props.categories} cookies={props.cookies}
                                   onClick={props.handleCategoryClick}/>}
            {props.isColorClicked &&
                <LinkColorButtonGroup cookies={props.cookies} onClick={props.handleColorClick}/>}
        </div>
    );
}
