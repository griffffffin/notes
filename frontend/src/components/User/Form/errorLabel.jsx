export default function ErrorLabel(props) {
    return (props.isError &&
        <label className="text-danger mb-0 pt-2 ps-3">{props.value}</label>);
}
