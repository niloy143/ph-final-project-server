const cors = require('cors');
const express = require('express');
const app = express();
const port = process.env.PORT || 1234;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send({status: 'running'})
})

app.listen(port, () => {
    console.log(`doctors portal server is running on ${port}`)
})