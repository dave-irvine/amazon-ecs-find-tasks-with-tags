const core = require('@actions/core');
const aws = require('aws-sdk');

/**
 * 
 * @param { [*] } arr 
 * @param { Number } size 
 */
const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

/**
 * 
 * @param { AWS.ECS } ecs
 * @param { string } cluster 
 * @param { string[] } taskArns
 * @returns { AWS.ECS.Tasks }
 */
async function describeTasks(ecs, cluster, taskArns) {
    const arnChunks = chunkArray(taskArns, 99);

    let taskResults = [];
    let tasks = [];

    while (tasks = arnChunks.shift()) {
        const params = {
            tasks,
            cluster,
            include: [ 'TAGS' ]
        };
        
        const result = await ecs.describeTasks(params).promise();
        
        taskResults = taskResults.concat(result.tasks || []);
    }

    return taskResults;
}

/**
 * 
 * @param { AWS.ECS } ecs 
 * @param { string } cluster 
 */
async function listAllTasks(ecs, cluster = 'default') {
    const params = {
        cluster,
    };

    let tasksResult = await ecs.listTasks(params).promise();
    let taskList = tasksResult.taskArns;

    while (tasksResult.nextToken) {
        tasksResult = await ecs.listTasks({ nextToken: tasksResult.nextToken }).promise();

        taskList = taskList.concat(tasksResult.taskArns || []);
    }

    return taskList;
}

async function run() {
    try {
        const ecs = new aws.ECS({
            customUserAgent: 'amazon-ecs-find-tasks-with-tags-for-github-actions'
        });

        // Get inputs
        const cluster = core.getInput('cluster', { required: false });
        const tagsInput = core.getInput('tags', { required: false });

        const tagsArray = tagsInput.split(",");
        const tagsMap = {};
        tagsArray.forEach((tag) => {
            const [key, value] = tag.split(":");

            tagsMap[key] = value;
        });

        try {
            const taskArns = await listAllTasks(ecs, cluster);
            core.debug(`Found tasks: ${taskArns}`);
            const tasks = await describeTasks(ecs, cluster, taskArns);
            const tasksWithTags = tasks.filter((task) => {
                // Do any of the task's tags match a tag that we are searching for?
                return task.tags.some((tag) => {
                    return tagsMap[tag.key] === tag.value;
                });
            });

            const taskArnsWithTags = tasksWithTags.map((task) => {
                return task.taskArn;
            });

            core.debug(`Tasks with matching tags ${taskArnsWithTags}`);

            core.setOutput("task-arns", taskArnsWithTags.join(','));
        } catch (error) {
            core.setFailed("Failed to stop task in ECS: " + error.message);
            throw (error);
        }
    }
    catch (error) {
        core.setFailed(error.message);
        core.debug(error.stack);
    }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
    run();
}