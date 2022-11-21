require('dotenv').config();
const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const tokenSecret = process.env.JWT_ACCESS;

app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    if (!(req.headers.authorization)) {
        return res.status(401).send({ access: 'denied' });
    }
    const token = req.headers.authorization.split(' ')[1];
    jwt.verify(token, tokenSecret, (err, decoded) => {
        if (err) {
            return res.status(401).send({ access: 'denied' });
        }
        req.decoded = decoded;
        next();
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.sq5icdb.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

app.get('/', (req, res) => {
    res.send({ status: 'running' })
})

app.post('/jwt', (req, res) => {
    const token = jwt.sign(req.body, tokenSecret, { expiresIn: '7d' });
    res.send({ token });
})

app.post('/create-payment-intent', verifyJWT, async (req, res) => {
    const { price } = req.body;
    const amount = price * 100;

    const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        automatic_payment_methods: {
            enabled: true
        }
    })

    res.send({ clientSecret: paymentIntent.client_secret });
})

async function run() {
    try {
        const appointmentOptionsCollection = client.db('doctorsPortal').collection('appointmentOptions');
        const bookingsCollection = client.db('doctorsPortal').collection('bookingsCollection');
        const usersCollection = client.db('doctorsPortal').collection('usersCollection');
        const doctorsCollection = client.db('doctorsPortal').collection('doctors');
        const paymentsCollection = client.db('doctorsPortal').collection('payments');

        const verifyAdmin = async (req, res, next) => {
            const user = await usersCollection.findOne({ uid: req.decoded.uid });
            if (!user || req.query.adminId !== user.uid || (user.role !== 'admin')) {
                return res.status(403).send({ access: 'forbidden' })
            }
            next();
        }

        app.get('/appointmentOptions', async (req, res) => {
            const appointmentOptions = await appointmentOptionsCollection.find({}).toArray();
            const bookingsOfTheDay = await bookingsCollection.find({ appointmentDate: req.query.date }).toArray();
            bookingsOfTheDay.forEach(booking => {
                appointmentOptions.map(appointment => {
                    if (booking.treatment === appointment.name) {
                        appointment.slots = appointment.slots.filter(slot => slot !== booking.schedule)
                    }
                })
            })
            res.send(appointmentOptions);
        })

        app.post('/bookings', async (req, res) => {
            const { appointmentDate, email, treatment } = req.body;
            const bookingsOfTheDay = await bookingsCollection.find({ appointmentDate: appointmentDate, email: email }).toArray();
            const alreadyBooked = bookingsOfTheDay.find(booking => booking.treatment === treatment);
            if (!!alreadyBooked) {
                return res.send({ acknowledged: false, message: `You already booked ${treatment} for this day.` });
            }
            else {
                const result = await bookingsCollection.insertOne(req.body);
                res.send(result);
            }
        })

        app.delete('/bookings/:id', verifyJWT, async (req, res) => {
            if (req.decoded.email !== req.query.email) {
                return res.status(403).send({ access: 'forbidden' });
            }
            const result = await bookingsCollection.deleteOne({ _id: ObjectId(req.params.id) });
            res.send(result);
        })

        app.get('/bookings', verifyJWT, async (req, res) => {
            if (req.decoded.email !== req.query.email) {
                return res.status(403).send({ access: 'forbidden' });
            }
            const bookings = await bookingsCollection.find({ email: req.query.email }).toArray();
            res.send(bookings);
        })

        app.get('/booking/:id', verifyJWT, async (req, res) => {
            if (req.decoded.email !== req.query.email) {
                return res.status(403).send({ access: 'forbidden' });
            }
            const booking = await bookingsCollection.findOne({ _id: ObjectId(req.params.id) });
            res.send(booking);
        })

        app.get('/admin', verifyJWT, verifyAdmin, async (req, res) => {
            res.send({ isAdmin: true });
        })

        app.post('/users', async (req, res) => {
            const user = await usersCollection.findOne({ uid: req.body.uid });
            if (!user) {
                usersCollection.insertOne(req.body)
            }
        })

        app.get('/users', verifyJWT, async (req, res) => {
            const users = await usersCollection.find({}).toArray();
            res.send(users);
        })

        app.put('/user', verifyJWT, verifyAdmin, async (req, res) => {
            const filter = { uid: req.query.candidate };
            const updateRole = { $set: { role: `${req.query.role === 'admin' ? 'user' : 'admin'}`, roleChangedBy: req.decoded.uid } };
            const options = { upsert: true };
            const result = await usersCollection.updateOne(filter, updateRole, options);
            res.send(result)
        })

        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorsCollection.find({}).toArray();
            res.send(doctors);
        })

        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await doctorsCollection.insertOne(req.body);
            res.send(result);
        })

        app.get('/doctor/specialties', verifyJWT, verifyAdmin, async (req, res) => {
            const specialties = await appointmentOptionsCollection.find({}).project({ name: 1 }).toArray();
            res.send(specialties);
        })

        app.delete('/doctor/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await doctorsCollection.deleteOne({ _id: ObjectId(req.params.id) });
            res.send(result);
        })

        app.post('/payments', verifyJWT, async (req, res) => {
            const paidResult = await bookingsCollection.updateOne({ _id: ObjectId(req.body._id) }, { $set: { paid: true } });
            const paymentResult = await paymentsCollection.insertOne(req.body);

            res.send({ paidResult, paymentResult });
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