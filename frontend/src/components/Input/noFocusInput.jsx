export default function NoFocusInput(props) {
    return (
        <input id={props.id} value={props.value} onChange={props.onChange} placeholder={props.placeholder}
               autoComplete={props.autoComplete} autoFocus={props.autoFocus} required={props.required}
               className={props.class + " form-control no-focus bg-transparent text-" + props.color}/>
    );
}
