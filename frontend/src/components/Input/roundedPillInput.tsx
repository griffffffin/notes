import type {ChangeEventHandler} from "react";

type RoundedPillInputProps = {
    /* Csak a jelszó-mezők adják meg (a szem-ikon váltogatja "password" és "text"
       között); a felhasználónévnél elmarad, ilyenkor a böngésző alapértelmezése,
       a "text" érvényes. A szűk unió azért jó, mert az <input type> több tucat
       értéke közül itt CSAK ez a kettő értelmes — egy elgépelt "pasword" néma
       szöveges mezőt adna, láthatatlanul olvasható jelszóval. */
    type?: "text" | "password";
    id: string;
    value: string;
    onChange: ChangeEventHandler<HTMLInputElement>;
    autoFocus: boolean;
    class: string;
};

export default function RoundedPillInput(props: RoundedPillInputProps) {
    return (
        // A required itt bedrótozott: minden belépő-/regisztrációs mező kötelező.
        <input type={props.type} id={props.id} value={props.value} onChange={props.onChange}
               autoFocus={props.autoFocus} required
               className={props.class + " form-control rounded-pill"}/>
    );
}
