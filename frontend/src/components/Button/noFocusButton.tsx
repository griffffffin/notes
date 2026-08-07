import type {MouseEventHandler, ReactNode} from "react";
import type {TodoColor} from "../../todoColors";

type NoFocusButtonProps = {
    /* A gomb VALUE-ja, amit a kattintás-kezelő az eseményből olvas ki (a
       kategória-lista gombjai így adják át a választott kategóriát). A legtöbb
       hívó nem használja: az ő gombjuk nem adat, hanem művelet. */
    value?: string;
    onClick: MouseEventHandler<HTMLButtonElement>;
    class: string;
    /* Opcionális, mert a navbar és a jelszó-mezők gombjai NEM adnak színt: náluk
       a látható tartalom egy ikon vagy egy kép, ami a saját osztályában viszi a
       színt. Ilyenkor a lenti "text-" + color a nem létező "text-undefined"
       osztályt adja — hatástalan, de innen tudni, hogy nem elfelejtett prop. */
    color?: TodoColor;
    /* Nem `string`: a hívók zöme ikont vagy <img>-et ad át. A ReactNode az a
       típus, ami MINDENT lefed, amit a React ki tud rajzolni (elem, szöveg,
       szám, tömb, null). */
    text: ReactNode;
};

export default function NoFocusButton(props: NoFocusButtonProps) {
    return (
        <button type="button" value={props.value} onClick={props.onClick}
                className={props.class + " btn btn-outline-primary bg-transparent no-focus text-" + props.color}>
            {props.text}
        </button>
    );
}
