-- The specific failure copy for a publish (JSON `{ title, message }`), when the run's log said
-- more than its error code does: "A button on Home links to /book, which isn't a page on your
-- site." Absent for failures the code alone describes.
ALTER TABLE publishes ADD COLUMN error_detail TEXT;
