module.exports = function calculatePercentage(request) {
    const tasks = request.body.tasks;
    let percentage = 100;
    const tasksLength = Object.keys(tasks).length;
    let doneCount = 0;
    for (const [key] of Object.entries(tasks)) {
        if (tasks[key].done === true) doneCount++;
    }
    if (tasksLength !== 0) percentage = Math.round(doneCount / tasksLength * 100);
    return percentage;
}
