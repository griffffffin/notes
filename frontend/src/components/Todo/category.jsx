import NoFocusInput from "../Input/noFocusInput";
import NoFocusButton from "../Button/noFocusButton";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";

export default function Category(props) {
    // Nincs useCallback: sima onChange/onClick, nincs memózott fogyasztó.
    const handleChange = (event) => {
        props.setCategory(event.target.value);
        event.target.value.length ? props.setIsValid(true) : props.setIsValid(false);
        props.setIsAngleClicked(false);
    };

    return (<>
        <div className="input-group">
            <NoFocusInput value={props.category} onChange={handleChange} placeholder="Kategória" autoComplete="off"
                          autoFocus={false} required={true} color={props.color} class="caveat ps-2"/>
            <NoFocusButton onClick={props.handleAngleClick} class="pb-0" text={
                <FontAwesomeIcon icon={props.isAngleClicked ? "fa-solid fa-angle-up" : "fa-solid fa-angle-down"}
                                 size="xl" className={"text-" + props.color}/>}/>
        </div>
        {props.isAngleClicked &&
            <div className="row mb-2">
                {props.categories.map((category) =>
                    <NoFocusButton key={category} value={category} onClick={handleChange}
                                   class="text-end pt-0 pb-2 pe-4" color={props.color} text={category}/>
                )}
            </div>
        }
    </>);
}
