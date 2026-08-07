/* A hibafelirat MAGA dönti el, megjelenik-e — ezért kap `isError`-t, ahelyett hogy
   a hívó tenné feltételes ág mögé. Így a két hívási hely (foglalt név, hibás
   belépés) egyformán néz ki. Ha nincs hiba, a komponens `false`-t ad vissza: a
   React ezt üresként rajzolja ki, nem hibaként. */
type ErrorLabelProps = {
    isError: boolean;
    value: string;
};

export default function ErrorLabel(props: ErrorLabelProps) {
    return (props.isError &&
        <label className="text-danger mb-0 pt-2 ps-3">{props.value}</label>);
}
