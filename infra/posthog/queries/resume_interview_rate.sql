-- Interviews reached per 100 resume generations, by prompt version and model,
-- over the last 90 days (JEF-598). `application_interview_reached` is sent when
-- an application gets its first interview round and carries the prompt version
-- and model behind the resume it went out with (apps/api CreateInterviewRoundUseCase);
-- `$ai_generation` with feature = 'resume' is every model call that wrote a resume.
--
-- The base is generations, not applications: a resume regenerated three times
-- counts three, so read the column as a way to compare prompt versions and
-- models with each other, not as a conversion rate. A version still too new to
-- have had interviews reads 0. The interview count sits beside the rate so a
-- small sample is visible.
SELECT
    toString(properties.prompt_version) AS prompt_version,
    properties.$ai_model AS model,
    countIf(event = '$ai_generation') AS generations,
    countIf(event = 'application_interview_reached') AS interviews,
    if(generations = 0, 0, round(100 * interviews / generations, 1)) AS interviews_per_100_generations
FROM events
WHERE ((event = '$ai_generation' AND properties.feature = 'resume') OR event = 'application_interview_reached')
    AND timestamp >= now() - INTERVAL 90 DAY
GROUP BY prompt_version, model
ORDER BY prompt_version DESC, generations DESC
LIMIT 50
