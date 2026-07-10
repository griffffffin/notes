import {useEffect, useState} from "react";
import Spinner from "../spinner";
import LinkCategoryGroup from "./categoryGroup";
import LinkColorButtonGroup from "./colorButtonGroup";

export default function CategoryAndColorGroup(props) {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (props.color && props.cookies) setIsLoading(false);
    }, [props.color, props.cookies]);

    return (
        isLoading ? <Spinner/> :
            <div className="row w-100">
                {props.isCategoryClicked &&
                    <LinkCategoryGroup categories={props.categories} color={props.color} cookies={props.cookies}
                                       onClick={props.handleCategoryClick}/>}
                {props.isColorClicked &&
                    <LinkColorButtonGroup cookies={props.cookies} onClick={props.handleColorClick}/>}
            </div>
    );
}
