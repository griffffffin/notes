export default function RoundedPillInput(props) {
    return (
        <input type={props.type} id={props.id} value={props.value} onChange={props.onChange}
               autoFocus={props.autoFocus} required
               className={props.class + " form-control rounded-pill"}/>
    );
}
