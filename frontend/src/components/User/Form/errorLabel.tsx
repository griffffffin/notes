/* A hibafelirat MAGA dönti el, megjelenik-e — ezért kapja a hiányt is (null),
   ahelyett hogy a hívó tenné feltételes ág mögé. Ha nincs hiba, a komponens
   `null`-t ad vissza: a React ezt üresként rajzolja ki, nem hibaként.

   Korábban ez KÉT prop volt (`isError` + `value`): a "van-e hiba" és a "mit
   írjunk" külön utazott, és a kettőt a hívónak kellett szinkronban tartania —
   egy igaz `isError` üres szöveggel néma, üres piros sort adott volna. Egyetlen
   nullable szövegből ez az állapot nem állítható elő. */
type ErrorLabelProps = {
    message: string | null;
};

export default function ErrorLabel(props: ErrorLabelProps) {
    return (props.message &&
        <label className="text-danger mb-0 pt-2 ps-3">{props.message}</label>);
}
