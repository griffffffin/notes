import NoFocusInput from "../Input/noFocusInput";
import NoFocusButton from "../Button/noFocusButton";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import type {ChangeEvent, MouseEvent} from "react";
import type {TodoColor} from "../../todoColors";

/* A három setter SZŰKEBB típust kap, mint amilyenek valójában (React
   state-setterek): itt csak annyi kell, hogy egy értékkel meg lehessen hívni
   őket. Egy `Dispatch<SetStateAction<string>>` a frissítő-FÜGGVÉNYES alakot is
   megengedné, amit ez a komponens sosem használ — a szűkebb típus pontosan a
   tényleges igényt írja le, és egy state-setter simán megfelel neki. */
type CategoryProps = {
    setCategory: (category: string) => void;
    setIsValid: (isValid: boolean) => void;
    setIsAngleClicked: (isAngleClicked: boolean) => void;
    category: string;
    color: TodoColor;
    handleAngleClick: () => void;
    isAngleClicked: boolean;
    /* A felhasználó eddig HASZNÁLT kategóriái — a legördülő ezekből kínál. */
    categories: string[];
};

export default function Category(props: CategoryProps) {
    /* Nincs useCallback: sima onChange/onClick, nincs memózott fogyasztó.

       Egyetlen kezelő KÉTFÉLE eseményt szolgál ki: a szövegmező gépelését és a
       kategória-gombok kattintását. Az érték ezért `currentTarget`-ből jön, nem
       `target`-ből — a kettő nem ugyanaz: a `target` az az elem, amin az esemény
       KELETKEZETT (gombnál akár egy belső elem), a `currentTarget` az, amire a
       kezelő KÖTVE van. A gombokon ma csak szöveg van, tehát a kettő egybeesik;
       a currentTarget viszont a típusban is az elem (nem csupasz EventTarget),
       és egy jövőbeli belső elem (ikon) sem tudja némán elrontani. */
    const handleChange = (event: ChangeEvent<HTMLInputElement> | MouseEvent<HTMLButtonElement>) => {
        const {value} = event.currentTarget;
        props.setCategory(value);
        props.setIsValid(value.length > 0);
        props.setIsAngleClicked(false);
    };

    return (<>
        <div className="input-group">
            <NoFocusInput value={props.category} onChange={handleChange} placeholder="Kategória" autoComplete="off"
                          autoFocus={false} required={true} color={props.color} class="caveat ps-2"/>
            <NoFocusButton onClick={props.handleAngleClick} class="pb-0" text={
                <FontAwesomeIcon icon={props.isAngleClicked ? ["fas", "angle-up"] : ["fas", "angle-down"]}
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
