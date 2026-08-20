import LinkCategoryGroup from "./categoryGroup";
import LinkColorButtonGroup from "./colorButtonGroup";
import type {CategoryGroupProps} from "./categoryGroup";
import type {MouseEventHandler} from "react";

export type CategoryAndColorGroupProps = {
    isCategoryClicked: boolean;
    isColorClicked: boolean;
    categories: CategoryGroupProps["categories"];
    categoriesFailed: CategoryGroupProps["categoriesFailed"];
    categoriesLoading: CategoryGroupProps["categoriesLoading"];
    onRetryCategories: CategoryGroupProps["onRetry"];
    /* A kategória-kattintás LINKRE megy (szűrt nézetre navigál), a szín-kattintás
       GOMBRA — ezért különbözik a két eseménykezelő elem-típusa. */
    handleCategoryClick: CategoryGroupProps["onClick"];
    handleColorClick: MouseEventHandler<HTMLButtonElement>;
};

export default function CategoryAndColorGroup(props: CategoryAndColorGroupProps) {
    return (
        <div className="row w-100">
            {props.isCategoryClicked &&
                <LinkCategoryGroup categories={props.categories} categoriesFailed={props.categoriesFailed}
                                   categoriesLoading={props.categoriesLoading}
                                   onRetry={props.onRetryCategories}
                                   onClick={props.handleCategoryClick}/>}
            {props.isColorClicked &&
                <LinkColorButtonGroup onClick={props.handleColorClick}/>}
        </div>
    );
}
