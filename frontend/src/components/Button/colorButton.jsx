export default function ColorButton(props) {
    return (
        <button type="button" value={props.color} onClick={props.onClick}
                className={props.class + " rounded-circle btn btn-lg btn-" + props.color}>
            &nbsp;&nbsp;
        </button>
    );
}
