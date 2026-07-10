export default function NoFocusButton(props) {
    return (
        <button type="button" value={props.value} onClick={props.onClick}
                className={props.class + " btn btn-outline-primary bg-transparent no-focus text-" + props.color}>
            {props.text}
        </button>
    );
}
