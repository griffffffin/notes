export default function SubmitButton(props) {
    return (
        <button type="submit" onClick={props.onClick} disabled={props.isDisabled}
                className={props.isOutline ? "btn rounded-pill w-100 btn-outline-" + props.color :
                    "btn rounded-pill my-1 btn-" + props.color}>
            {props.text}
        </button>
    );
}
