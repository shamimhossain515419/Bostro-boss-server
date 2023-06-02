const express = require("express");

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const jwt = require('jsonwebtoken');

require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const cors = require('cors');

const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());


const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}

const uri = `mongodb+srv://${process.env.VITE_USER}:${process.env.VITE_PASS}@cluster0.jt15atw.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  // try {
  //   // Connect the client to the server	(optional starting in v4.7)
  //   await client.connect();
  const tokenJwt = process.env.ACCESS_TOKEN_SECRET;

  const menuCollection = client.db("bistroDb").collection("menu");
  const reviewCollection = client.db("bistroDb").collection("reviews");
  const cartsCollection = client.db("bistroDb").collection("carts");
  const usersCollection = client.db("bistroDb").collection("users");
  const PaymentCollection = client.db("bistroDb").collection("payment");
  app.post('/jwt', (req, res) => {
    const user = req.body;
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

    res.send({ token })
  })


  const verifyAdmin = async (req, res, next) => {
    const email = req.decoded.email;
    const query = { email: email }
    const user = await usersCollection.findOne(query);
    if (user?.role !== 'admin') {
      return res.status(403).send({ error: true, message: 'forbidden message' });
    }
    next();
  }


  app.post('/user', async (req, res) => {
    const user = req.body;
    const query = { email: user.email }
    const existingUser = await usersCollection.findOne(query);

    if (existingUser) {
      return res.send({ message: 'user already exists' })
    }
    const result = await usersCollection.insertOne(user);
    res.send(result);
  })

  app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
    const result = await usersCollection.find().toArray();
    res.send(result)
  })

  app.delete('/users/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await usersCollection.deleteOne(query);

    res.send(result)
  })

  app.get('/users/admin/:email', verifyJWT, async (req, res) => {
    const email = req.params.email;
    if (req.decoded.email !== email) {
      res.send({ admin: false })
    }
    const query = { email: email }
    const user = await usersCollection.findOne(query);
    const result = { admin: user?.role === 'admin' }

    res.send(result);
  })

  app.patch('/users/admin/:id', async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: {
        role: "admin"
      },
    };
    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
  })


  // menu related apis 
  app.get('/menu', async (req, res) => {
    const result = await menuCollection.find().toArray()
    res.send(result);
  })

  app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
    const body = req.body;
    const result = await menuCollection.insertOne(body);
    res.send(result)
  })

  app.delete('/menu/:id', verifyJWT, verifyAdmin, async (req, res) => {
    const IdNumber = req.params.id;
    const query = { _id: (IdNumber) };
    const result = await menuCollection.deleteOne(query);
    res.send(result)
  })
  app.get('/menu/:id', async (req, res) => {
    const IdNumber = req.params.id;
    const query = { _id: (IdNumber) };
    const result = await menuCollection.findOne(query);
    res.send(result)
  })

  // review related apis 
  app.get('/review', async (req, res) => {
    const result = await reviewCollection.find().toArray()
    res.send(result);
  })

  // carts related apis
  app.post('/carts', async (req, res) => {
    const item = req.body;
    const result = await cartsCollection.insertOne(item);
    res.send(result);
  })
  app.get('/carts', verifyJWT, async (req, res) => {
    const email = req.query.email;
    if (!email) {
      res.send([]);
    }
    const decodedEmail = req.decoded.email;
    if (email !== decodedEmail) {
      return res.status(403).send({ error: true, message: 'porviden access' })
    }
    const query = { email: email };
    const result = await cartsCollection.find(query).toArray();
    res.send(result);
  })

  app.delete('/carts/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await cartsCollection.deleteOne(query);
    res.send(result);
  })

  //  payment relateded api 
  app.post('/create-payment-intent', verifyJWT, async (req, res) => {
    const { price } = req.body;
    const amount = price * 100;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      payment_method_types: ['card']
    });

    res.send({
      clientSecret: paymentIntent.client_secret
    })
  })

  app.post('/payment',async(req,res)=>{
      const payment = req.body;
     const insertResult = await  PaymentCollection.insertOne(payment);

     const query = {_id: { $in: payment.cartItems.map(id => new ObjectId(id)) }}
     const deleteResult = await cartsCollection.deleteMany(query)

     res.send({ insertResult, deleteResult});
  })
  await client.db("admin").command({ ping: 1 });
  console.log("Pinged your deployment. You successfully connected to MongoDB!");
  // } finally {
  //   // Ensures that the client will close when you finish/error
  //   // await client.close();
  // }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})