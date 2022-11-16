require('dotenv').config();
const cors = require('cors');
const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.sq5icdb.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

app.get('/', (req, res) => {
    res.send({ status: 'running' })
})

async function run() {
    try {
        const appointmentOptionsCollection = client.db('doctorsPortal').collection('appointmentOptions');
        const bookingsCollection = client.db('doctorsPortal').collection('bookingsCollection');

        app.get('/appointmentOptions', async (req, res) => {
            const appointmentOptions = await appointmentOptionsCollection.find({}).toArray();
            const todaysBooking = await bookingsCollection.find({ appointmentDate: req.query.date }).toArray();
            todaysBooking.forEach(booking => {
                appointmentOptions.map(appointment => {
                    if (booking.treatment === appointment.name) {
                        appointment.slots = appointment.slots.filter(slot => slot !== booking.schedule)
                    }
                })
            })
            res.send(appointmentOptions);
        })

        app.post('/bookings', async (req, res) => {
            const feedback = await bookingsCollection.insertOne(req.body);
            res.send(feedback);
        })
    }
    catch (err) {
        console.error(err)
    }
}

run().catch(err => console.error(err))

app.listen(port, () => {
    console.log(`doctors portal server is running on ${port}`)
})