import LinkCategory from "./category";

export default function CategoryGroup(props) {
    return (
        <div className="row pe-5">
            {props.categories.map((category) =>
                <LinkCategory key={category} category={category}
                              class={"text-end pt-0 pb-2 pe-5"} onClick={props.onClick}/>)
            }
        </div>
    );
}
